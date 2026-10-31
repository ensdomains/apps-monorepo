/**
 * Base URL + route builders for the locally-run ENS Metadata Service V2
 * (github.com/ensdomains/metadata-service-v2), started by the
 * `metadata-service` container in `e2e/infra/docker-compose.yml`.
 *
 * Route shapes are taken directly from that repo's `src/index.ts` (pinned
 * commit — see `infra/Dockerfile.metadata-service`), not guessed:
 *
 * - `/:network/avatar/:name`, `/:network/avatar/:name/meta`,
 *   `/:network/header/:name` — name-keyed, resolve via on-chain fallback.
 * - `/:network/:registryType/:name` (`registryType` = `registry` |
 *   `namewrapper`) — the unified metadata/image/rasterize routes' **v2 URL
 *   shape**. `registryType` only seeds the response's self-referential URLs
 *   and `version` (`buildMetadataFromBlockchain`); the actual migration
 *   classification comes from `statusFromSource` reading the name itself, so
 *   this resolves a genuinely-v1 name correctly too — it is not v2-only
 *   despite the route's name.
 * - `/:network/:contractAddress/:tokenId` — the unified routes' **v1 URL
 *   shape** (BaseRegistrar/NameWrapper address + numeric tokenId, the form a
 *   marketplace's `tokenURI()` call produces). `resolveTokenId` reverses the
 *   tokenId's hash back to a name via the indexer — there is no on-chain
 *   fallback for that specific reversal (a label cannot be recovered from its
 *   hash). With this harness's indexers deliberately unreachable (see
 *   docker-compose.yml's comment on `metadata-service`), this route can only
 *   be exercised for graceful degradation, not a successful resolve — see the
 *   MD6 invariant sweep.
 * - `/migration-status/:name`, `/registry-hierarchy/:name` — name-keyed,
 *   `?network=` query param (not a path segment), on-chain fallback.
 */

export const METADATA_SERVICE_URL =
  process.env.METADATA_SERVICE_URL ?? 'http://127.0.0.1:8787'

export type MetadataNetwork = 'mainnet' | 'sepolia'
export type RegistryType = 'registry' | 'namewrapper'

const base = (path: string) => `${METADATA_SERVICE_URL}${path}`
const enc = encodeURIComponent

export const routes = {
  root: () => base('/'),
  health: () => base('/health'),

  avatar: (network: MetadataNetwork, name: string) =>
    base(`/${network}/avatar/${enc(name)}`),
  avatarMeta: (network: MetadataNetwork, name: string) =>
    base(`/${network}/avatar/${enc(name)}/meta`),
  header: (network: MetadataNetwork, name: string) =>
    base(`/${network}/header/${enc(name)}`),

  metadataByName: (
    network: MetadataNetwork,
    name: string,
    registryType: RegistryType = 'registry',
  ) => base(`/${network}/${registryType}/${enc(name)}`),
  imageByName: (
    network: MetadataNetwork,
    name: string,
    registryType: RegistryType = 'registry',
  ) => base(`/${network}/${registryType}/${enc(name)}/image`),

  metadataByTokenId: (
    network: MetadataNetwork,
    contractAddress: string,
    tokenId: string,
  ) => base(`/${network}/${contractAddress}/${tokenId}`),

  migrationStatus: (name: string, network: MetadataNetwork) =>
    base(`/migration-status/${enc(name)}?network=${network}`),
  registryHierarchy: (name: string, network: MetadataNetwork) =>
    base(`/registry-hierarchy/${enc(name)}?network=${network}`),

  batchMetadata: () => base('/batch-metadata'),
  webhook: () => base('/webhook'),
}

export type MigrationStatus = 'unmigrated' | 'migrated' | 'native'

export interface MigrationStatusResponse {
  name: string
  status: MigrationStatus
  owner?: string
  migrationDate?: string
  expirationDate?: string
}

export interface MetadataAttribute {
  trait_type: string
  value: string | number
  display_type?: string
}

export interface MetadataResponse {
  is_normalized: boolean
  name: string
  description: string
  attributes: MetadataAttribute[]
  url: string
  last_request_date: number
  version: number
  background_image: string
  image: string
  image_url: string
}
