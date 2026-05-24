/**
 * Manager-side wrapper around `@ens-apps/smart-account`'s
 * `initializeRhinestoneAccount`.
 *
 * Responsibilities live here, not in the package:
 *
 *   - Picking between an external `WalletClient` (wagmi) and a Para
 *     embedded wallet.
 *   - Building a viem `Account` from either source. Para's MPC
 *     signatures use 0/1 v-byte and need `wrapParaAccount` to be
 *     usable by the Rhinestone SDK.
 *   - Reading manager-specific env vars (`VITE_RHINESTONE_API_KEY`,
 *     `VITE_PIMLICO_API_KEY`, `VITE_RHINESTONE_ENDPOINT_URL`,
 *     `VITE_RHINESTONE_CUSTOM_RPC_URLS`).
 *   - Injecting the manager's chain (`customSepolia`).
 *   - Driving the setup-progress toast UX via sonner + lingui.
 *   - Calling `registerHCAOwnership` after the SCA deploys, via the
 *     package's `onAccountReady` hook.
 */

import {
  type RhinestoneInitResult as CoreRhinestoneInitResult,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount as initializeRhinestoneAccountCore,
} from '@ens-apps/smart-account'
import type {
  RhinestoneSigner,
  TransactionInfra,
} from '@ens-apps/transaction-manager'
import { createParaAccount } from '@getpara/viem-v2-integration'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import {
  type RhinestoneAccount,
  walletClientToAccount,
  wrapParaAccount,
} from '@rhinestone/sdk'
import { toast } from 'sonner'
import {
  type Account,
  type Address,
  numberToHex,
  type WalletClient,
} from 'viem'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { registerHCAOwnership } from './hca-registry'
import type { ParaClient } from './types'

/**
 * Wallet-compatibility shim for EIP-712 integer fields.
 *
 * Rhinestone's typed-data schemas declare opaque 32-byte orchestrator-issued
 * identifiers (e.g. `SingleChainOps.nonce`) as `uint256`. viem serializes
 * `uint256` bigints as JSON decimal strings on the wire — legal, but some
 * wallets (Zerion observed; any ethers-v6-backed parser at risk) coerce
 * >2^53 decimal-string numerics into JS `Number`, lose precision, and reject
 * signing with:
 *
 *   overflow (argument="value", value=4.46e+71, code=INVALID_ARGUMENT, ...)
 *
 * Pre-encoding every `uint*`/`int*` field as a `0x`-hex string before signing
 * is digest-preserving (the EIP-712 type stays `uint256`, only the wire
 * encoding changes — `encodeData` produces the identical 32-byte word for
 * either encoding) and immune to JSON parser coercion.
 *
 * TODO: remove once the SDK ships hex pre-encoding at its signing boundary
 * (or declares opaque-bytes32 fields as `bytes32` in the EIP-712 schema, which
 * is the proper fix but requires an on-chain verifier upgrade).
 */
function convertIntegerFieldsToHex(
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>,
  primaryType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const struct = types[primaryType]
  if (!struct) return data

  const result: Record<string, unknown> = { ...data }
  for (const { name, type } of struct) {
    const value = result[name]
    if (value === undefined || value === null) continue

    // Strip array suffix (e.g. `Ops[]` -> `Ops`).
    const elementType = type.replace(/\[\d*\]$/, '')
    const isArray = type !== elementType

    const integerMatch = elementType.match(/^(u?int)(\d+)$/)
    const baseType = integerMatch?.[1]
    const sizeBitsStr = integerMatch?.[2]
    if (
      baseType &&
      sizeBitsStr &&
      (typeof value === 'bigint' || typeof value === 'number')
    ) {
      result[name] = numberToHex(value, {
        signed: baseType === 'int',
        size: Number.parseInt(sizeBitsStr, 10) / 8,
      })
      continue
    }

    // Recurse into nested struct types.
    if (types[elementType]) {
      if (isArray && Array.isArray(value)) {
        result[name] = value.map((item) =>
          convertIntegerFieldsToHex(
            types,
            elementType,
            item as Record<string, unknown>,
          ),
        )
      } else if (typeof value === 'object') {
        result[name] = convertIntegerFieldsToHex(
          types,
          elementType,
          value as Record<string, unknown>,
        )
      }
    }
  }
  return result
}

/**
 * Wrap an account so its `signTypedData` pre-converts `uint*`/`int*` fields to
 * hex strings. See `convertIntegerFieldsToHex` for the rationale.
 */
function withHexIntegerTypedData(account: Account): Account {
  const originalSign = account.signTypedData
  if (!originalSign) return account
  const original = originalSign.bind(account) as NonNullable<
    Account['signTypedData']
  >
  const wrapped: NonNullable<Account['signTypedData']> = async (parameters) => {
    const typed = parameters as unknown as {
      domain?: Record<string, unknown>
      message: Record<string, unknown>
      primaryType: string
      types: Record<string, ReadonlyArray<{ name: string; type: string }>>
    }
    const nextDomain =
      typed.domain && typed.types.EIP712Domain
        ? convertIntegerFieldsToHex(typed.types, 'EIP712Domain', typed.domain)
        : typed.domain
    const nextMessage =
      typed.primaryType === 'EIP712Domain'
        ? typed.message
        : convertIntegerFieldsToHex(
            typed.types,
            typed.primaryType,
            typed.message,
          )
    return original({
      ...parameters,
      domain: nextDomain,
      message: nextMessage,
    } as typeof parameters)
  }
  return { ...account, signTypedData: wrapped } as Account
}

export interface RhinestoneConfig {
  chain: typeof customSepolia
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
  paraClient?: ParaClient
  /**
   * Whether to register HCA ownership in the HCAFactory after the smart
   * account is deployed. Defaults to `true` because manager only uses
   * HCA-mode accounts in production.
   */
  registerHCA?: boolean
  infrastructure?: TransactionInfra
}

export interface RhinestoneInitResult {
  client: RhinestoneAccount
  address: Address
  ownerAddress: Address
  config: RhinestoneConfig
}

/**
 * Resolve a viem `Account` + EOA address from whichever wallet
 * provider the user is connected through. Throws if neither is
 * available.
 */
function resolveOwnerAccount(params: {
  walletClient?: WalletClient
  paraClient?: ParaClient
}): { ownerAccount: Account; eoaAddress: Address } {
  const { walletClient, paraClient } = params

  if (walletClient?.account?.address) {
    return {
      ownerAccount: withHexIntegerTypedData(
        walletClientToAccount(walletClient),
      ),
      eoaAddress: walletClient.account.address,
    }
  }

  if (paraClient) {
    const paraAccount = createParaAccount(paraClient)
    return {
      // Para's MPC signatures use 0/1 v-byte recovery; Rhinestone /
      // ERC-4337 modules expect 27/28. `wrapParaAccount` adjusts.
      ownerAccount: withHexIntegerTypedData(wrapParaAccount(paraAccount)),
      eoaAddress: paraAccount.address as Address,
    }
  }

  throw new Error(
    'Either walletClient or paraClient must be provided for Rhinestone initialization',
  )
}

/**
 * Resolve env-derived SDK options.
 *
 * Two oddities preserved from the previous implementation:
 *   - A local orchestrator (`VITE_RHINESTONE_ENDPOINT_URL` set) is
 *     considered API-key-eligible even without `VITE_RHINESTONE_API_KEY`,
 *     using the placeholder `'local-dev'`. Lets us run against the
 *     mockestrator in e2e without a production key.
 *   - `VITE_RHINESTONE_CUSTOM_RPC_URLS` is JSON-encoded in the env.
 */
function resolveSdkEnv(): {
  rhinestoneApiKey: string
  pimlicoApiKey?: string
  rhinestoneEndpointUrl?: string
  rhinestoneCustomRpcUrls?: Record<number, string>
} {
  const endpointUrl = import.meta.env.VITE_RHINESTONE_ENDPOINT_URL || undefined
  const isLocalOrchestrator = !!endpointUrl

  const apiKey =
    import.meta.env.VITE_RHINESTONE_API_KEY ||
    (isLocalOrchestrator ? 'local-dev' : undefined)

  if (!apiKey) {
    throw new Error(
      'Rhinestone API key not configured in environment variables',
    )
  }

  const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY || undefined

  const customRpcUrlsRaw = import.meta.env.VITE_RHINESTONE_CUSTOM_RPC_URLS
  const customRpcUrls = customRpcUrlsRaw
    ? (JSON.parse(customRpcUrlsRaw) as Record<number, string>)
    : undefined

  return {
    rhinestoneApiKey: apiKey,
    pimlicoApiKey,
    rhinestoneEndpointUrl: endpointUrl,
    rhinestoneCustomRpcUrls: customRpcUrls,
  }
}

/**
 * Initialize a Rhinestone smart account for the manager app.
 *
 * Thin wrapper that injects manager-side concerns (chain, env, toaster,
 * HCA registration) into the pure `initializeRhinestoneAccount` from
 * `@ens-apps/smart-account`.
 *
 * @throws Error if initialization fails. Toasts are surfaced as a
 * side-effect via sonner.
 */
export async function initializeRhinestoneAccount(
  params: InitializeRhinestoneParams,
): Promise<RhinestoneInitResult> {
  const {
    walletClient,
    paraClient,
    registerHCA = true,
    infrastructure = 'warp',
  } = params

  const { ownerAccount, eoaAddress } = resolveOwnerAccount({
    walletClient,
    paraClient,
  })
  const env = resolveSdkEnv()

  // One loading toast id covers the whole setup so we don't flash
  // a success state between deploy and HCA registration. We only
  // surface it if we actually do work (deploy or register); a fully
  // cached path stays silent.
  let setupToastShown = false
  const setupToastId = `setup-sca-${eoaAddress}`

  const showSetupToast = (description: string) => {
    setupToastShown = true
    toast.loading(i18n._(msg`Setting up your smart account`), {
      description,
      id: setupToastId,
    })
  }

  const onAccountReady: InitializeRhinestoneAccountParams['onAccountReady'] =
    async ({ rhinestoneAccount, accountAddress, wasDeployedInThisCall }) => {
      if (!registerHCA) return

      const signer: RhinestoneSigner = {
        type: 'rhinestone',
        // Rhinestone account types can come from different package
        // instances across workspace boundaries. We intentionally
        // adapt via `unknown` to the transaction-manager signer
        // contract while keeping runtime shape.
        account: rhinestoneAccount as unknown as RhinestoneSigner['account'],
        config: {
          chain: customSepolia,
          accountAddress,
          rhinestoneApiKey: env.rhinestoneApiKey,
          defaultInfra: infrastructure,
        },
      }

      // Only show the registering toast if we just deployed. If the
      // SCA was already deployed, `registerHCAOwnership` is most
      // often a no-op (returns 'already-registered' after a read)
      // and we don't want to flash a toast for nothing. Errors below
      // still surface via the package's `onError` even without a
      // prior toast.
      if (wasDeployedInThisCall) {
        showSetupToast(i18n._(msg`Registering account ownership…`))
      }

      const result = await registerHCAOwnership({
        smartAccountAddress: accountAddress,
        eoaAddress,
        signer,
        publicClient,
      })

      if (result.isErr()) {
        throw new Error(
          `HCA registration failed: ${result.error.reason} - ${result.error.details}`,
        )
      }
    }

  const coreParams: InitializeRhinestoneAccountParams = {
    ownerAccount,
    eoaAddress,
    chain: customSepolia,
    rhinestoneApiKey: env.rhinestoneApiKey,
    pimlicoApiKey: env.pimlicoApiKey,
    rhinestoneEndpointUrl: env.rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls: env.rhinestoneCustomRpcUrls,
    infrastructure,
    onAccountReady,
    onProgress: (stage) => {
      if (stage === 'deploying') {
        showSetupToast(i18n._(msg`Deploying on-chain…`))
      } else if (stage === 'ready' && setupToastShown) {
        toast.success(i18n._(msg`Smart account ready`), {
          id: setupToastId,
          duration: 3000,
        })
      }
    },
    onError: (stage, error) => {
      const title =
        stage === 'deploying'
          ? i18n._(msg`Failed to deploy smart account`)
          : i18n._(msg`Smart account setup failed`)
      toast.error(title, {
        id: setupToastId,
        description: error.message,
        duration: 5000,
      })
    },
  }

  const result: CoreRhinestoneInitResult =
    await initializeRhinestoneAccountCore(coreParams)

  return {
    client: result.client,
    address: result.address,
    ownerAddress: result.ownerAddress,
    config: {
      chain: customSepolia,
      rhinestoneApiKey: result.config.rhinestoneApiKey,
    },
  }
}
