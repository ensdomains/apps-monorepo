import {
  type SupportedL1ChainId,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'

export const ENS_NETWORKS = ['mainnet', 'sepolia'] as const

export type EnsNetwork = (typeof ENS_NETWORKS)[number]

/**
 * ENS-operated services that are NOT derivable from the chain.
 *
 * Contract addresses and block explorer links come from the chain object
 * (ensjs + viem) and deliberately do not live here — duplicating them would
 * let the two sources drift.
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

export const INDEXER_BACKENDS = ['bigname', 'goldsky', 'zigens'] as const

/** Which indexer the apps read names from. */
export type IndexerBackend = (typeof INDEXER_BACKENDS)[number]

/** Indexer deployments besides bigname, which `endpoints.bignameApi` holds. */
export type IndexerEndpoints = {
  /** Goldsky's ENS API, bigname's routes under `/v2`. */
  readonly goldskyApi: string | null
  /** zigens GraphQL, read for ENSv2 names. */
  readonly zigensGraphql: string | null
  /** ENSNode's subgraph-compatible GraphQL, read for ENSv1 names. */
  readonly ensNodeSubgraph: string | null
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
  readonly endpoints: NetworkEndpoints
  /** The default indexer and the other deployments `VITE_INDEXER` can pick. */
  readonly indexer: Readonly<{
    backend: IndexerBackend
    endpoints: IndexerEndpoints
  }>
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
    endpoints: {
      bignameApi: 'https://api.bigname.sh',
    },
    indexer: {
      backend: 'bigname',
      endpoints: {
        goldskyApi: 'https://ens-api.goldsky.com',
        zigensGraphql: 'https://mainnet-graphql.ens.dev',
        ensNodeSubgraph:
          'https://ensnode-api-production.up.railway.app/subgraph',
      },
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
    indexer: {
      backend: 'bigname',
      endpoints: {
        // Goldsky indexes mainnet and Base only.
        goldskyApi: null,
        zigensGraphql: 'https://graphql.ens.dev',
        ensNodeSubgraph: 'https://ensnode-api-sepolia.up.railway.app/subgraph',
      },
    },
  },
} as const satisfies Record<EnsNetwork, NetworkProfile>

export const isEnsNetwork = (value: unknown): value is EnsNetwork =>
  typeof value === 'string' && ENS_NETWORKS.includes(value as EnsNetwork)
