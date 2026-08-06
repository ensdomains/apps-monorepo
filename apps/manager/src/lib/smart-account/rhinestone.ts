/**
 * Manager-side wrapper around `@ens-apps/smart-account`'s
 * `initializeRhinestoneAccount` (standalone HCA).
 *
 * Responsibilities live here, not in the package:
 *
 *   - Building a viem `Account` from the connected external `WalletClient`
 *     (wagmi).
 *   - Reading manager-specific env vars (`VITE_RHINESTONE_API_KEY`,
 *     `VITE_RHINESTONE_ENDPOINT_URL`, `VITE_RHINESTONE_CUSTOM_RPC_URLS`).
 *   - Injecting the manager's chain (`customSepolia`) and public client.
 *
 * The account is the standalone ENS HCA (single ECDSA owner + scoped
 * SmartSession validator). It is created in-memory with a deterministic address
 * and adopts an existing on-chain HCA after verification; there is NO separate
 * deploy transaction — the first Rhinestone request deploys it lazily.
 */

import {
  type RhinestoneInitResult as CoreRhinestoneInitResult,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount as initializeRhinestoneAccountCore,
} from '@ens-apps/smart-account'
import {
  type RhinestoneAccount,
  type RhinestoneSDK,
  walletClientToAccount,
} from '@rhinestone/sdk'
import type { Account, Address, PublicClient, WalletClient } from 'viem'
import {
  BASE_SEPOLIA_RPC_URL,
  customBaseSepolia,
  customSepolia,
} from '@/lib/wagmi'

export interface RhinestoneConfig {
  chain: typeof customSepolia
  rhinestoneApiKey: string
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
  publicClient: PublicClient
  /** Require the current implementation be trusted (primary-name actions). */
  requireTrustedForPrimary?: boolean
}

export interface RhinestoneInitResult {
  client: RhinestoneAccount
  /** SDK instance, reused to derive the cross-chain funding Nexus. */
  sdk: RhinestoneSDK
  address: Address
  ownerAddress: Address
  /** The connected wallet as a viem `Account` — the Nexus's ECDSA owner. */
  ownerAccount: Account
  alreadyDeployed: boolean
  config: RhinestoneConfig
}

/**
 * Resolve a viem `Account` + EOA address from the connected external wallet.
 * Throws if no wallet client is available.
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
 * A local orchestrator (`VITE_RHINESTONE_ENDPOINT_URL` set) is considered
 * API-key-eligible even without `VITE_RHINESTONE_API_KEY`, using the
 * placeholder `'local-dev'`. Lets us run against the mockestrator in e2e
 * without a production key.
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
    rhinestoneCustomRpcUrls: {
      // The SDK derives its own RPC map from the account's chain, which is
      // Sepolia only. Cross-chain funding needs the source chain in there too
      // or the Nexus derivation and source leg have no provider. Env overrides
      // win, so a local/mockestrator setup can still repoint it.
      [customBaseSepolia.id]: BASE_SEPOLIA_RPC_URL,
      ...customRpcUrls,
    },
  }
}

/**
 * Initialize the standalone HCA smart account (in-memory; lazy on-chain
 * deploy). Adopts an already-deployed HCA after verification.
 *
 * @throws Error if initialization or adopt-existing verification fails.
 */
export async function initializeRhinestoneAccount(
  params: InitializeRhinestoneParams,
): Promise<RhinestoneInitResult> {
  const { walletClient, publicClient, requireTrustedForPrimary } = params

  const { ownerAccount, eoaAddress } = resolveOwnerAccount({ walletClient })
  const env = resolveSdkEnv()

  const coreParams: InitializeRhinestoneAccountParams = {
    ownerAccount,
    eoaAddress,
    chain: customSepolia,
    publicClient,
    rhinestoneApiKey: env.rhinestoneApiKey,
    rhinestoneEndpointUrl: env.rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls: env.rhinestoneCustomRpcUrls,
    ...(requireTrustedForPrimary ? { requireTrustedForPrimary } : {}),
  }

  const result: CoreRhinestoneInitResult =
    await initializeRhinestoneAccountCore(coreParams).match(
      (value) => value,
      (error) => {
        throw error
      },
    )

  return {
    client: result.client,
    sdk: result.sdk,
    address: result.address,
    ownerAddress: result.ownerAddress,
    ownerAccount,
    alreadyDeployed: result.alreadyDeployed,
    config: {
      chain: customSepolia,
      rhinestoneApiKey: result.config.rhinestoneApiKey,
    },
  }
}
