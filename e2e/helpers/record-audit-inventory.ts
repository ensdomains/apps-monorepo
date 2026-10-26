/**
 * Mock V1 names — answers the manager's bigname reads for ENSv1 names
 * registered on the local Anvil chain, which no bigname deployment indexes.
 *
 * It serves the ENSv1 listing (`authority=ens_v1,ens_v0`) the migration reads, the detail
 * lookups for these names (fields and record keys) and their record inventory at
 * the resolver. Every other bigname request falls through to the next handler,
 * e.g. the shared bigname mock.
 */
import type { Page, Route } from '@playwright/test'
import { labelhash, namehash } from 'viem'
import {
  V1_PUBLIC_RESOLVER as FIXTURE_V1_RESOLVER,
  type V1AddressRecord,
  type V1NameType,
  type V1TextRecord,
} from '../fixtures/makeV1Name.js'
import { publicClient } from './anvil-client.js'

/**
 * The resolver `makeV1Name` writes records to. The app takes record keys from
 * bigname and reads their values on chain from the resolver bigname reports, so
 * a different default here replays nothing (GR1 read back null in mock mode).
 */
const V1_PUBLIC_RESOLVER = FIXTURE_V1_RESOLVER
const CHAIN_ID = 11155111
type InventoryMeta = { readonly as_of: Record<number, { readonly block_number: number; readonly block_hash: string; readonly timestamp: string }>; readonly completeness: 'full' }
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

/**
 * Fuse values matching the NameWrapper contract.
 * PARENT_CANNOT_CONTROL and IS_DOT_ETH are auto-set for .eth 2LDs.
 */
const FUSES = {
  CANNOT_UNWRAP: 1,
  CANNOT_TRANSFER: 4,
  PARENT_CANNOT_CONTROL: 1 << 16,
  IS_DOT_ETH: 1 << 17,
} as const

const DOT_ETH_FUSES = FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH

export type MockV1Name = {
  /** Full name including .eth (e.g. "migtest-123.eth") */
  readonly migrated?: boolean
  readonly fullFuses?: number
  readonly wrapperExpiry?: number
  readonly name: string
  /** EOA address that owns this V1 name */
  readonly ownerAddress: string
  /** V1 name type — must match what was passed to makeV1Name */
  readonly type?: V1NameType
  /**
   * Owner-controlled fuse bits (e.g. FUSES.CANNOT_UNWRAP | FUSES.CANNOT_BURN_FUSES).
   * PARENT_CANNOT_CONTROL and IS_DOT_ETH are always added, as the NameWrapper
   * does for .eth 2LDs. When omitted, the fuses follow `type`.
   */
  readonly fuses?: number
  /**
   * Registration expiry timestamp (Unix seconds). Defaults to one year after
   * the chain's clock when the mock is installed — not the wall clock: time
   * specs warp the shared fork months ahead, and a wall-clock year then reads
   * as long expired.
   */
  readonly expiryDate?: number
  /** The V1 resolver to report. Defaults to a known public resolver. */
  readonly resolver?: string
  /**
   * The BaseRegistrar holder when it differs from the registry controller
   * (`ownerAddress`): the name is listed for, and owned by, the registrant,
   * and `ownerAddress` is its manager.
   */
  readonly registrantAddress?: string
  /** No live ENSv2 entry: bigname's `unresolvable_reason` says so (GA12). */
  readonly unreserved?: boolean
  /** V1 records set on this name; only their keys are served. */
  readonly records?: {
    readonly texts?: readonly V1TextRecord[]
    readonly addresses?: readonly V1AddressRecord[]
    /** Presence, not value: served as the `contenthash` singleton key. */
    readonly contentHash?: string | null
    readonly abiContentTypes?: readonly number[]
    readonly interfaceIds?: readonly string[]
  }
}

const wrapperFuses = (n: MockV1Name): number =>
  n.fullFuses ??
  (n.fuses ?? (n.type === 'locked' ? FUSES.CANNOT_UNWRAP : 0)) | DOT_ETH_FUSES

const fuseFlags = (fuses: number) => ({
  fuses,
  cannot_unwrap: (fuses & FUSES.CANNOT_UNWRAP) !== 0,
  cannot_burn_fuses: (fuses & 2) !== 0,
  cannot_transfer: (fuses & FUSES.CANNOT_TRANSFER) !== 0,
  cannot_set_resolver: (fuses & 8) !== 0,
  cannot_set_ttl: (fuses & 16) !== 0,
  cannot_create_subdomain: (fuses & 32) !== 0,
  cannot_approve: (fuses & 64) !== 0,
  parent_cannot_control: (fuses & FUSES.PARENT_CANNOT_CONTROL) !== 0,
  is_dot_eth: (fuses & FUSES.IS_DOT_ETH) !== 0,
  can_extend_expiry: (fuses & (1 << 18)) !== 0,
})

const isWrapped = (n: MockV1Name) => n.type === 'wrapped' || n.type === 'locked'

const hasResolver = (n: MockV1Name) =>
  Boolean(n.resolver) || Boolean(n.records) || isWrapped(n)
const resolverOf = (n: MockV1Name) =>
  (n.resolver ?? V1_PUBLIC_RESOLVER).toLowerCase()

/** The bigname record for a mock ENSv1 .eth 2LD, as a detail lookup returns it. */
function v1Record(n: MockV1Name, now: number) {
  const expiry = String(n.expiryDate ?? now + 365 * 24 * 60 * 60)
  const owner = (n.registrantAddress ?? n.ownerAddress).toLowerCase()
  const manager = n.ownerAddress.toLowerCase()
  return {
    name: n.name,
    display_name: n.name,
    namespace: 'ens',
    namehash: namehash(n.name),
    labelhash: labelhash(n.name.split('.')[0]),
    owner,
    manager,
    registrant: owner,
    registered_at: String(now),
    created_at: String(now),
    expires_at: expiry,
    status: n.name.split('.').length === 2 && Number(expiry) <= now ? 'grace' : 'active',
    authority: n.migrated ? 'ens_v2' : 'ens_v1',
    ens_v1: isWrapped(n)
      ? {
          expires_at: expiry,
          wrapper_state: n.type === 'locked' ? 'locked' : (wrapperFuses(n) & FUSES.PARENT_CANNOT_CONTROL) ? 'emancipated' : 'wrapped',
          wrapper_fuses: fuseFlags(wrapperFuses(n)),
          wrapper_expires_at: String(n.wrapperExpiry ?? expiry),
        }
      : { expires_at: expiry, wrapper_state: 'unwrapped' },
    ...(hasResolver(n) && {
      resolver: { chain_id: CHAIN_ID, address: resolverOf(n) },
      records: {
        seen_addresses:
          n.records?.addresses?.map(({ coinType }) => String(coinType)) ?? [],
        addresses: {},
        seen_texts: n.records?.texts?.map(({ key }) => key) ?? [],
        texts: {},
        seen_abis: n.records?.abiContentTypes?.map(String) ?? [],
        abis: {},
        seen_singletons: n.records?.contentHash ? ['contenthash'] : [],
      },
    }),
    ...(n.unreserved && { unresolvable_reason: 'no_live_ens_v2_entry' }),
    read_status: 'ok',
  }
}

/** The name's record inventory, as `/v1/resolvers/{c}/{a}/records` serves it. */
function v1ResolverRecords(n: MockV1Name, meta: InventoryMeta) {
  return {
    data: {
      namespace: 'ens',
      resolver: { chain_id: CHAIN_ID, address: resolverOf(n) },
      records: {},
      inventory: {
        known_keys: [
          'pubkey',
          ...(n.records?.interfaceIds ?? ['0x12345678']).map(id => `interface:${id}`),
          ...(n.records?.contentHash ? ['contenthash'] : []),
          ...(n.records?.texts?.map(({ key }) => `text:${key}`) ?? []),
          ...(n.records?.addresses?.map(({ coinType }) => `addr:${coinType}`) ??
            []),
        ],
        unset_keys: [],
        unsupported_keys: [],
        abi_content_types: n.records?.abiContentTypes?.map(String) ?? [],
      },
    },
    meta,
  }
}

/** The ENSv1 names page for an `authority=ens_v1` address names request. */
function v1Listing(url: URL, mockNames: readonly MockV1Name[], now: number, meta: InventoryMeta) {
  const address = url.pathname
    .match(/^\/v1\/addresses\/([^/]+)\/names$/)?.[1]
    ?.toLowerCase()
  const isV1Listing =
    url.searchParams.get('authority')?.split(',').includes('ens_v1') ?? false
  if (!address || !isV1Listing) return undefined
  const relationsFor = (n: MockV1Name) => [
    ...((n.registrantAddress ?? n.ownerAddress).toLowerCase() === address ? ['owner'] : []),
    ...(n.ownerAddress.toLowerCase() === address ? ['manager'] : []),
  ]
  const requested = url.searchParams.get('relation')?.split(',') ?? ['any']
  const rows = mockNames
    .filter((n) => !n.migrated && relationsFor(n).some(r => requested.includes('any') || requested.includes(r)))
    .map((n) => ({
      ...v1Record(n, now),
      relations: relationsFor(n),
      is_primary: false,
    }))
  console.log(`[mock-v1-names] serving ${rows.length} V1 names for ${address}`)
  return {
    data: rows,
    page: {
      cursor: null,
      next_cursor: null,
      page_size: rows.length,
      total_count: rows.length,
      has_more: false,
    },
    meta,
  }
}

/** The mock name a resolver records request asks for, if it uses that resolver. */
function nameAtResolver(url: URL, byName: ReadonlyMap<string, MockV1Name>) {
  const resolver = url.pathname.match(
    /^\/v1\/resolvers\/\d+\/([^/]+)\/records$/,
  )?.[1]
  const n = byName.get(url.searchParams.get('name')?.toLowerCase() ?? '')
  return n && hasResolver(n) && resolver?.toLowerCase() === resolverOf(n)
    ? n
    : undefined
}

/**
 * Serve mock ENSv1 names from bigname. Call this BEFORE navigating to pages
 * that read the migration list.
 */
type BignameMock = {
  readonly addName: (domain: { name: string; owner: string }) => void
}

export async function mockV1Names(
  page: Page,
  mockNames: readonly MockV1Name[],
): Promise<{ readonly markMigrated: (bignameMock: BignameMock) => void }> {
  const byName = new Map(mockNames.map((n) => [n.name.toLowerCase(), n]))
  let isMigrated = false
  const checkpoint = await publicClient.getBlock({ blockTag: 'latest' })
  const chainNow = Number(checkpoint.timestamp)
  // Each installation owns its checkpoint. This is a complete inventory of
  // these fresh fixture identities, not a claim that the real indexer caught up.
  // Refresh from an actual canonical block when serving discovery: UI checks
  // can take longer than the app's five-minute inventory freshness window.
  let meta: InventoryMeta = { as_of: { [CHAIN_ID]: { block_number: Number(checkpoint.number), block_hash: checkpoint.hash, timestamp: String(checkpoint.timestamp) } }, completeness: 'full' }
  let refreshedAt = Date.now()
  const children = (name: string) => mockNames.filter(n => n.name.split('.').slice(1).join('.') === name)
  const detail = (n: MockV1Name) => ({ ...v1Record(n, chainNow), subname_count: children(n.name).length })

  const fulfill = (route: Route, json: unknown) =>
    route.fulfill({ status: 200, json, headers: CORS_HEADERS })

  // Hosted bigname in CI, and the local one (:5660) when a dev server reads it
  // — the same match as mock-bigname.ts. Missing :5660 sent mock-mode runs to
  // the real local index, which nothing had waited on.
  await page.route(/(?:bigname\.sh|(?:localhost|127\.0\.0\.1):\d+)\/v1\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (isMigrated) return route.fallback()
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    }

    if (Date.now() - refreshedAt > 15_000) {
      const current = await publicClient.getBlock({ blockTag: 'latest' })
      meta = { as_of: { [CHAIN_ID]: { block_number: Number(current.number), block_hash: current.hash, timestamp: String(current.timestamp) } }, completeness: 'full' }
      refreshedAt = Date.now()
    }
    const match = url.pathname.match(/^\/v1\/names\/([^/]+)(?:\/(subnames|records))?$/)
    const n = match ? byName.get(decodeURIComponent(match[1]).toLowerCase()) : undefined
    if (n && match) {
      if (match[2] === 'subnames') {
        const rows = children(n.name).map(detail)
        return fulfill(route, { data: rows, meta, page: { cursor: null, next_cursor: null, page_size: rows.length, total_count: rows.length, has_more: false } })
      }
      if (match[2] === 'records') return fulfill(route, v1ResolverRecords(n, meta))
      return fulfill(route, { data: detail(n), meta })
    }

    if (url.pathname === '/v1/events' && byName.has(url.searchParams.get('name') ?? '')) {
      const target = byName.get(url.searchParams.get('name')!)!
      const rows = (target.records?.interfaceIds ?? ['0x12345678']).map(id => ({ type: 'record', data: { key: `interface:${id}` } }))
      return fulfill(route, { data: rows, meta, page: { cursor: null, next_cursor: null, page_size: 200, total_count: rows.length, has_more: false } })
    }
    const listing = v1Listing(url, mockNames, chainNow, meta)
    if (listing) return fulfill(route, listing)

    const atResolver = nameAtResolver(url, byName)
    if (atResolver) return fulfill(route, v1ResolverRecords(atResolver, meta))

    if (request.method() === 'POST' && url.pathname === '/v1/lookup') {
      const inputs: { name?: string }[] = request.postDataJSON()?.inputs ?? []
      const known = inputs.map((input) =>
        input.name ? byName.get(input.name.toLowerCase()) : undefined,
      )
      if (inputs.length > 0 && known.every((n) => n !== undefined)) {
        return fulfill(route, {
          data: inputs.map((input, index) => {
            const n = known[index]
            return n
              ? {
                  input,
                  kind: 'name',
                  status: 'ok',
                  record: detail(n),
                }
              : { input, kind: 'name', status: 'not_found' }
          }),
          meta,
        })
      }
    }

    return route.fallback()
  })

  return {
    /** After a migration, the names are ENSv2 names served by the shared mock. */
    markMigrated: (bignameMock) => {
      isMigrated = true
      for (const n of mockNames) {
        bignameMock.addName({ name: n.name, owner: n.ownerAddress })
      }
    },
  }
}
