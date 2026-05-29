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
 *   - Injecting the manager's chain (`customSepolia`) and the on-chain
 *     `HCAFactory` address + ABI.
 *   - Driving the setup-progress toast UX via sonner + lingui.
 *   - Bootstrapping the HCA proxy via the package's `bootstrapHCA`
 *     (an EOA-signed, sponsored `HCAFactory.createAccount(initData)`
 *     Intent) and binding the SDK to its address via the package's
 *     `onPrepareDeploy` hook. The manager only constructs HCA-mode
 *     accounts — there is no opt-out.
 */

import {
  bootstrapHCA,
  type RhinestoneInitResult as CoreRhinestoneInitResult,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount as initializeRhinestoneAccountCore,
} from '@ens-apps/smart-account'
import {
  ENS_SEPOLIA_CONTRACTS,
  type TransactionInfra,
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
import type { Account, Address, WalletClient } from 'viem'
import { HCA_FACTORY_ABI } from '@/lib/hca-factory.abi'
import { customSepolia, publicClient } from '@/lib/wagmi'
import type { ParaClient } from './types'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
  paraClient?: ParaClient
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
 * provider the user is connected through. The same account is used
 * for:
 *
 *   - signing the Intent's EIP-712 payload during HCA bootstrap
 *     (the EOA-mode Rhinestone SDK reads `eoa.signTypedData`),
 *   - signing the SCA's session-enable signature,
 *   - signing any subsequent Rhinestone Intents that route through
 *     the SCA after bootstrap.
 *
 * For Para, `wrapParaAccount` adjusts MPC signatures from 0/1 v-byte
 * to 27/28 — Rhinestone / ERC-4337 modules' on-chain `ecrecover`
 * expects the latter.
 *
 * Throws if neither source is available.
 */
function resolveOwnerAccount(params: {
  walletClient?: WalletClient
  paraClient?: ParaClient
}): {
  ownerAccount: Account
  eoaAddress: Address
} {
  const { walletClient, paraClient } = params

  if (walletClient?.account?.address) {
    return {
      ownerAccount: walletClientToAccount(walletClient),
      eoaAddress: walletClient.account.address,
    }
  }

  if (paraClient) {
    const paraAccount = createParaAccount(paraClient)
    return {
      // Para's MPC signatures use 0/1 v-byte recovery; Rhinestone /
      // ERC-4337 modules expect 27/28. `wrapParaAccount` adjusts.
      ownerAccount: wrapParaAccount(paraAccount),
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
  const { walletClient, paraClient, infrastructure = 'warp' } = params

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

  // `onPrepareDeploy` runs before `sdk.createAccount` and is fully
  // responsible for putting the SCA on chain. Under the HCA flow this
  // is a single EOA-signed, sponsored Intent
  // (`HCAFactory.createAccount(initData)`) that also writes
  // `_hcaOwners[hca] = eoa` atomically. The returned address is then
  // bound to the SDK via `initData: { address }`.
  const onPrepareDeploy: InitializeRhinestoneAccountParams['onPrepareDeploy'] =
    async () => {
      showSetupToast(i18n._(msg`Deploying on-chain…`))
      const result = await bootstrapHCA({
        eoaAddress,
        ownerAccount,
        chain: customSepolia,
        publicClient,
        factoryAddress: ENS_SEPOLIA_CONTRACTS.HCAFactory,
        factoryAbi: HCA_FACTORY_ABI,
        sdk: {
          rhinestoneApiKey: env.rhinestoneApiKey,
          pimlicoApiKey: env.pimlicoApiKey,
          rhinestoneEndpointUrl: env.rhinestoneEndpointUrl,
          rhinestoneCustomRpcUrls: env.rhinestoneCustomRpcUrls,
        },
      })
      if (result.isErr()) {
        // Surface the tagged-error reason in the thrown message so
        // the package's `onError('deploying', …)` produces a useful
        // toast. The inner cause is preserved on the `cause` property
        // for devtools inspection. `TaggedError`
        // (`@ens-apps/utils/neverthrow`) puts fields directly on the
        // instance via `Object.assign(this, args)`, so we read
        // `.reason` / `.cause` off the error directly.
        const err = result.error
        throw new Error(`HCA bootstrap failed: ${err.reason}`, {
          cause: err.cause,
        })
      }
      return {
        hcaAddress: result.value.hcaAddress,
        wasDeployedInThisCall: result.value.wasDeployedInThisCall,
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
    onPrepareDeploy,
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
