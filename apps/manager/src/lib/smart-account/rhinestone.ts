/**
 * Manager-side wrapper around `@ens-apps/smart-account`'s
 * `initializeRhinestoneAccount` (standalone HCA).
 *
 * Responsibilities live here, not in the package:
 *
 *   - Building a viem `Account` from the connected external `WalletClient`
 *     (wagmi).
 *   - Reading manager-specific env vars (`VITE_RHINESTONE_ENDPOINT_URL`,
 *     `VITE_RHINESTONE_CUSTOM_RPC_URLS`) and choosing how the SDK
 *     authenticates: server-minted access tokens, or a placeholder key
 *     against the local mockestrator.
 *   - Injecting the manager's chain (`appChain`) and public client.
 *
 * The account is the standalone ENS HCA (single ECDSA owner + scoped
 * SmartSession validator). It is created in-memory with a deterministic address
 * and adopts an existing on-chain HCA after verification; there is NO separate
 * deploy transaction — the first Rhinestone request deploys it lazily.
 */

import {
  type RhinestoneInitResult as CoreRhinestoneInitResult,
  createL2BridgeAccount,
  fetchIntentOperationStatus,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount as initializeRhinestoneAccountCore,
  type RhinestoneAuth,
} from '@ens-apps/smart-account'
import { type RhinestoneAccount, walletClientToAccount } from '@rhinestone/sdk'
import type { Account, Address, PublicClient, WalletClient } from 'viem'
import { chain as appChain, l2Sources } from '@/config'
import { getRhinestoneAccessToken } from './rhinestoneAccessToken'

export interface RhinestoneConfig {
  chain: typeof appChain
}

export interface InitializeRhinestoneParams {
  walletClient?: WalletClient
  publicClient: PublicClient
  /** Require the current implementation be trusted (primary-name actions). */
  requireTrustedForPrimary?: boolean
}

export interface RhinestoneInitResult {
  client: RhinestoneAccount
  address: Address
  ownerAddress: Address
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
 * The placeholder the local mockestrator accepts. It stands in for a key only
 * where `VITE_RHINESTONE_ENDPOINT_URL` points the SDK at that mock.
 */
const LOCAL_ORCHESTRATOR_API_KEY = 'local-dev'

/**
 * Resolve env-derived SDK options.
 *
 * Against the real orchestrator the SDK authenticates with access tokens the
 * manager's own server mints (`issueRhinestoneAccessToken`), so no credential
 * is in the bundle. Against the local mockestrator (`VITE_RHINESTONE_ENDPOINT_URL`,
 * e2e and local infra) a placeholder key is enough.
 *
 * `VITE_RHINESTONE_CUSTOM_RPC_URLS` is JSON-encoded in the env.
 */
function resolveSdkEnv(): {
  readonly rhinestoneAuth: RhinestoneAuth
  readonly rhinestoneEndpointUrl?: string
  readonly rhinestoneCustomRpcUrls?: Record<number, string>
} {
  const endpointUrl = import.meta.env.VITE_RHINESTONE_ENDPOINT_URL || undefined
  const rhinestoneAuth: RhinestoneAuth = endpointUrl
    ? { mode: 'apiKey', apiKey: LOCAL_ORCHESTRATOR_API_KEY }
    : { mode: 'jwt', getAccessToken: getRhinestoneAccessToken }

  const customRpcUrlsRaw = import.meta.env.VITE_RHINESTONE_CUSTOM_RPC_URLS
  const customRpcUrls = customRpcUrlsRaw
    ? (JSON.parse(customRpcUrlsRaw) as Record<number, string>)
    : undefined

  return {
    rhinestoneAuth,
    rhinestoneEndpointUrl: endpointUrl,
    rhinestoneCustomRpcUrls: customRpcUrls,
  }
}

/**
 * Build the orchestrator status lookup registration verification uses — on
 * live and resumed runs alike — to tell a still-filling reveal intent from a
 * definitively dead one, so it can fail fast instead of sitting out the
 * on-chain grace poll.
 *
 * Honors the same env resolution as the SDK init (access tokens, or the
 * placeholder key against the e2e mockestrator). Returns undefined when the
 * env cannot be read — the machine then falls back to the blind poll, which
 * is always safe.
 */
export function buildIntentStatusFetcher():
  | ((intentId: bigint, signal?: AbortSignal) => Promise<string | null>)
  | undefined {
  try {
    const { rhinestoneAuth, rhinestoneEndpointUrl } = resolveSdkEnv()
    return (intentId, signal) =>
      fetchIntentOperationStatus({
        intentId,
        auth: rhinestoneAuth,
        endpointUrl: rhinestoneEndpointUrl,
        signal,
      })
  } catch {
    return undefined
  }
}

/**
 * An SDK account for the wallet itself, to pay with its USDC on an L2. Reads the
 * source L2 and the app chain over the app's own RPCs.
 *
 * The SDK's custom provider takes one URL per chain, so neither chain gets the
 * failover the read clients have: it is handed the primary, which is drpc. Both
 * chains must therefore be enabled for the drpc key, or every quote and submit
 * for an L2 payment fails there while the balance still reads through the
 * public fallback.
 */
export function createBridgeAccount(params: {
  readonly eoa: Account
  readonly sourceChainId: number
}) {
  const { rhinestoneAuth, rhinestoneEndpointUrl } = resolveSdkEnv()
  const rpcUrls: Record<number, string> = {}
  const sourceRpcUrl = l2Sources.find(
    ({ chain }) => chain.id === params.sourceChainId,
  )?.rpcUrls[0]
  if (sourceRpcUrl) rpcUrls[params.sourceChainId] = sourceRpcUrl
  const appRpcUrl = appChain.rpcUrls.default.http[0]
  if (appRpcUrl) rpcUrls[appChain.id] = appRpcUrl
  return createL2BridgeAccount({
    eoa: params.eoa,
    auth: rhinestoneAuth,
    endpointUrl: rhinestoneEndpointUrl,
    rpcUrls,
  })
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
    chain: appChain,
    publicClient,
    rhinestoneAuth: env.rhinestoneAuth,
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
    address: result.address,
    ownerAddress: result.ownerAddress,
    alreadyDeployed: result.alreadyDeployed,
    config: { chain: appChain },
  }
}
