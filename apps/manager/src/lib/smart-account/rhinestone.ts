/**
 * Manager-side wrapper around `@ens-apps/smart-account`'s
 * `initializeRhinestoneAccount`.
 *
 * Responsibilities live here, not in the package:
 *
 *   - Building a viem `Account` from the connected external
 *     `WalletClient` (wagmi).
 *   - Reading manager-specific env vars (`VITE_RHINESTONE_API_KEY`,
 *     `VITE_RHINESTONE_ENDPOINT_URL`, `VITE_RHINESTONE_CUSTOM_RPC_URLS`).
 *   - Injecting the manager's chain (`customSepolia`).
 *   - Driving the setup-progress toast UX via sonner + lingui.
 *
 * The account is a Rhinestone HCA (Hidden Contract Account): the ENS
 * ownership validator is installed atomically by the factory at
 * construction, so there is **no** post-deploy ownership-registration
 * step. Gas is sponsored through the Rhinestone Warp orchestrator; the
 * owning wallet signs each Intent (no time-boxed owner session is active —
 * the HCA does not use SmartSessions).
 */

import {
  type RhinestoneInitResult as CoreRhinestoneInitResult,
  deployRhinestoneAccountCore,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccountCore,
} from '@ens-apps/smart-account'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type RhinestoneAccount, walletClientToAccount } from '@rhinestone/sdk'
import { toast } from 'sonner'
import type { Account, Address, WalletClient } from 'viem'
import { customSepolia } from '@/lib/wagmi'
import { createJwtAuthCallbacks } from './sponsorship-jwt'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
}

export interface RhinestoneInitResult {
  client: RhinestoneAccount
  address: Address
  ownerAddress: Address
  config: RhinestoneConfig
}

/**
 * Resolve a viem `Account` + EOA address from the connected external
 * wallet. Throws if no wallet client is available.
 */
function resolveOwnerAccount(params: { walletClient?: WalletClient }): {
  ownerAccount: Account
  eoaAddress: Address
} {
  const { walletClient } = params

  if (walletClient?.account?.address) {
    return {
      ownerAccount: walletClientToAccount(walletClient),
      eoaAddress: walletClient.account.address,
    }
  }

  throw new Error(
    'A walletClient must be provided for Rhinestone initialization',
  )
}

/**
 * Resolve env-derived SDK options.
 *
 * A local orchestrator (`VITE_RHINESTONE_ENDPOINT_URL` set) is
 * considered API-key-eligible even without `VITE_RHINESTONE_API_KEY`,
 * using the placeholder `'local-dev'`. Lets us run against the
 * mockestrator in e2e without a production key.
 *
 * `VITE_RHINESTONE_CUSTOM_RPC_URLS` is JSON-encoded in the env.
 */
function resolveSdkEnv(): {
  rhinestoneApiKey: string
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

  const customRpcUrlsRaw = import.meta.env.VITE_RHINESTONE_CUSTOM_RPC_URLS
  const customRpcUrls = customRpcUrlsRaw
    ? (JSON.parse(customRpcUrlsRaw) as Record<number, string>)
    : undefined

  return {
    rhinestoneApiKey: apiKey,
    rhinestoneEndpointUrl: endpointUrl,
    rhinestoneCustomRpcUrls: customRpcUrls,
  }
}

/**
 * Initialize a Rhinestone HCA smart account (in-memory only, no on-chain deploy).
 *
 * Thin wrapper that injects manager-side concerns (chain, env) into the
 * pure `initializeRhinestoneAccountCore` from `@ens-apps/smart-account`.
 * The HCA is created in-memory with a deterministic address but is **not**
 * deployed on-chain. Call `deployRhinestoneAccount` later to deploy when
 * first needed (e.g. during registration or renewal).
 *
 * @throws Error if initialization fails.
 */
export async function initializeRhinestoneAccount(
  params: InitializeRhinestoneParams,
): Promise<RhinestoneInitResult> {
  const { walletClient } = params

  const { ownerAccount, eoaAddress } = resolveOwnerAccount({
    walletClient,
  })
  const env = resolveSdkEnv()

  // JWT-mode sponsorship is the default path: the SDK authenticates each
  // sponsored intent through the api-worker `shouldSponsor` predicate (which is
  // where sponsorship policy lives). Set VITE_FF_EXPERIMENTAL_JWT=false to fall
  // back to the static API-key path; any other value (incl. unset) keeps JWT.
  const jwtAuth =
    import.meta.env.VITE_FF_EXPERIMENTAL_JWT === 'false'
      ? undefined
      : createJwtAuthCallbacks()

  const coreParams: InitializeRhinestoneAccountParams = {
    ownerAccount,
    eoaAddress,
    chain: customSepolia,
    rhinestoneApiKey: env.rhinestoneApiKey,
    jwtAuth,
    rhinestoneEndpointUrl: env.rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls: env.rhinestoneCustomRpcUrls,
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

/**
 * Deploy a Rhinestone HCA on-chain if it is not already deployed.
 *
 * Wraps `deployRhinestoneAccountCore` with manager-side toasts for
 * progress/error feedback. The HCA is deployed via a sponsored Intent
 * (Rhinestone Warp) — the relayer pays gas, the owner signs once.
 *
 * Safe to call multiple times — if the HCA is already on-chain, this
 * is a no-op (resolves immediately).
 */
export async function deployRhinestoneAccount(
  client: RhinestoneAccount,
  chain: typeof customSepolia,
): Promise<void> {
  const setupToastId = `setup-sca-deploy-${(client.getAddress() as string).slice(0, 10)}`

  await deployRhinestoneAccountCore(
    client,
    chain,
    (stage) => {
      if (stage === 'deploying') {
        toast.loading(i18n._(msg`Setting up your smart account`), {
          description: i18n._(msg`Deploying on-chain…`),
          id: setupToastId,
        })
      } else if (stage === 'ready') {
        toast.success(i18n._(msg`Smart account ready`), {
          id: setupToastId,
          duration: 3000,
        })
      }
    },
    (_stage, error) => {
      toast.error(i18n._(msg`Failed to deploy smart account`), {
        id: setupToastId,
        description: error.message,
        duration: 5000,
      })
    },
  )
}
