import { requireUrl } from './buildConfig.ts'
import { NetworkConfigError } from './errors.ts'
import {
  type EnsNetwork,
  INDEXER_BACKENDS,
  type IndexerBackend,
  type IndexerEndpoints,
  NETWORKS,
} from './networks.ts'

/** The indexer a build reads, with the endpoints that backend needs. */
export type IndexerSelection =
  | Readonly<{ backend: 'bigname'; bignameApi: string }>
  | Readonly<{ backend: 'goldsky'; goldskyApi: string }>
  | Readonly<{
      backend: 'zigens'
      zigensGraphql: string
      ensNodeSubgraph: string
    }>

export type ResolveIndexerInput = Readonly<{
  network: EnsNetwork
  /** Typically `VITE_INDEXER`; empty or absent keeps the network's default. */
  backend?: string | undefined
  /** The app's resolved bigname endpoint, so its e2e override carries over. */
  bignameApi: string | null
  /** Per-endpoint overrides, typically from env. Empty or absent falls back. */
  overrides?: Partial<Record<keyof IndexerEndpoints, string | undefined>>
}>

const isIndexerBackend = (value: string): value is IndexerBackend =>
  INDEXER_BACKENDS.includes(value as IndexerBackend)

const toBackend = (network: EnsNetwork, backend: string | undefined) => {
  if (!backend) return NETWORKS[network].indexer.backend
  if (isIndexerBackend(backend)) return backend
  throw new NetworkConfigError(
    `Unknown indexer ${JSON.stringify(backend)}. Expected one of: ${INDEXER_BACKENDS.join(', ')}.`,
  )
}

/** Pick the indexer for one network; a backend with no deployment there throws, like `buildConfig`. */
export const resolveIndexer = ({
  network,
  backend: requested,
  bignameApi,
  overrides,
}: ResolveIndexerInput): IndexerSelection => {
  const backend = toBackend(network, requested)
  const endpoint = (key: keyof IndexerEndpoints | 'bignameApi') => {
    const value =
      key === 'bignameApi'
        ? bignameApi
        : overrides?.[key] || NETWORKS[network].indexer.endpoints[key]
    if (!value) {
      throw new NetworkConfigError(
        `Network ${network} has no ${key} for the ${backend} indexer. Pick another indexer or pass an override.`,
      )
    }
    return requireUrl(value, `endpoint ${key}`)
  }
  switch (backend) {
    case 'bigname':
      return { backend, bignameApi: endpoint('bignameApi') }
    case 'goldsky':
      return { backend, goldskyApi: endpoint('goldskyApi') }
    case 'zigens':
      return {
        backend,
        zigensGraphql: endpoint('zigensGraphql'),
        ensNodeSubgraph: endpoint('ensNodeSubgraph'),
      }
  }
}
