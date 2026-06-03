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
 *     `VITE_RHINESTONE_ENDPOINT_URL`, `VITE_RHINESTONE_CUSTOM_RPC_URLS`).
 *   - Injecting the manager's chain (`customSepolia`).
 *   - Driving the setup-progress toast UX via sonner + lingui.
 *
 * The account is a Rhinestone HCA (Hidden Contract Account): the ENS
 * ownership validator is installed atomically by the factory at
 * construction, so there is **no** post-deploy ownership-registration
 * step. Gas is sponsored through the Rhinestone Warp orchestrator; the
 * owning wallet signs each Intent (there is no smart session).
 */

import {
  type RhinestoneInitResult as CoreRhinestoneInitResult,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount as initializeRhinestoneAccountCore,
} from '@ens-apps/smart-account'
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
import { customSepolia } from '@/lib/wagmi'
import type { ParaClient } from './types'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
  paraClient?: ParaClient
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
 * Initialize a Rhinestone HCA smart account for the manager app.
 *
 * Thin wrapper that injects manager-side concerns (chain, env, toaster)
 * into the pure `initializeRhinestoneAccount` from
 * `@ens-apps/smart-account`.
 *
 * @throws Error if initialization fails. Toasts are surfaced as a
 * side-effect via sonner.
 */
export async function initializeRhinestoneAccount(
  params: InitializeRhinestoneParams,
): Promise<RhinestoneInitResult> {
  const { walletClient, paraClient } = params

  const { ownerAccount, eoaAddress } = resolveOwnerAccount({
    walletClient,
    paraClient,
  })
  const env = resolveSdkEnv()

  // One loading toast id covers the whole setup. We only surface it if
  // we actually deploy; a fully cached (already-deployed) path stays
  // silent.
  let setupToastShown = false
  const setupToastId = `setup-sca-${eoaAddress}`

  const showSetupToast = (description: string) => {
    setupToastShown = true
    toast.loading(i18n._(msg`Setting up your smart account`), {
      description,
      id: setupToastId,
    })
  }

  const coreParams: InitializeRhinestoneAccountParams = {
    ownerAccount,
    eoaAddress,
    chain: customSepolia,
    rhinestoneApiKey: env.rhinestoneApiKey,
    rhinestoneEndpointUrl: env.rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls: env.rhinestoneCustomRpcUrls,
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
    onError: (_stage, error) => {
      toast.error(i18n._(msg`Failed to deploy smart account`), {
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
