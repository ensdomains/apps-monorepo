import {
  type SupportedL1ChainId,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'

export const ENS_NETWORKS = ['mainnet', 'sepolia'] as const

export type EnsNetwork = (typeof ENS_NETWORKS)[number]

/**
 * ENS-operated services that are NOT derivable from the chain.
 *
 * Contract addresses, the v1 subgraph URL and block explorer links all come
 * from the chain object (ensjs + viem) and deliberately do not live here —
 * duplicating them would let the two sources drift. The one exception is
 * `NetworkProfile.v1SubgraphUrl`, for a network whose ensjs default is broken.
 *
 * `null` means "no deployment exists for this network yet". `buildConfig`
 * rejects a null that has not been overridden, unless the app allows missing
 * endpoints, so the gap surfaces as a build error naming the field rather
 * than as a silent cross-network request.
 */
export type NetworkEndpoints = {
  /** bigname REST indexer. */
  readonly bignameApi: string | null
}

export type NetworkProfile = {
  readonly chainId: SupportedL1ChainId
  readonly isTestnet: boolean
  /** App backend API; local/E2E builds can override it with VITE_API_URL. */
  readonly appApiUrl: string
  /**
   * Public failover RPC endpoints. Each app supplies its own attributed
   * primary; these are the shared, uncorrelated backups behind it.
   *
   * App CSPs derive their `connect-src` allowlist from this list, so an
   * endpoint added here without a CSP entry is silently blocked by the
   * browser.
   */
  readonly rpcFallbacks: readonly string[]
  /** Replaces the v1 subgraph ensjs puts on the chain; absent keeps it. */
  readonly v1SubgraphUrl?: string
  readonly endpoints: NetworkEndpoints
}

/**
 * Per-network data. `satisfies` is the growth lever: adding a field to
 * `NetworkEndpoints` fails the build until every network declares it, and
 * adding a network fails until every field is filled.
 */
export const NETWORKS = {
  mainnet: {
    chainId: supportedL1Chains.mainnet,
    isTestnet: false,
    appApiUrl: 'https://mainnet.app-api.ens.domains',
    rpcFallbacks: ['https://ethereum-rpc.publicnode.com'],
    // ensjs points mainnet at api.alpha.blue.ensnode.io, which serves Railway's
    // wildcard certificate, so browsers refuse it. This is ENSNode's Railway
    // host; drop the override once that domain has its own certificate.
    v1SubgraphUrl: 'https://ensnode-api-production.up.railway.app/subgraph',
    endpoints: {
      // No mainnet bigname deployment yet.
      bignameApi: null,
    },
  },
  sepolia: {
    chainId: supportedL1Chains.sepolia,
    isTestnet: true,
    appApiUrl: 'https://sepolia.app-api.ens.domains',
    rpcFallbacks: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      // Tenderly over 1rpc.io: 1rpc's free tier rate-limits quickly, which
      // makes it a weak failover exactly when the primary is struggling.
      'https://sepolia.gateway.tenderly.co',
    ],
    endpoints: {
      bignameApi: 'https://sepolia.api.bigname.sh',
    },
  },
} as const satisfies Record<EnsNetwork, NetworkProfile>

export const isEnsNetwork = (value: unknown): value is EnsNetwork =>
  typeof value === 'string' && ENS_NETWORKS.includes(value as EnsNetwork)
