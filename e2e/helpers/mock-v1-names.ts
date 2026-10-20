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
import { namehash } from 'viem'
import type {
  V1AddressRecord,
  V1NameType,
  V1TextRecord,
} from '../fixtures/makeV1Name.js'

const V1_PUBLIC_RESOLVER = '0x640294a2b2d87e7f522db3e3e3e876764bce170d'
const CHAIN_ID = 11155111
const META = { as_of: {} }
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
  /** Registration expiry timestamp (Unix seconds). Defaults to now + 1 year. */
  readonly expiryDate?: number
  /** V1 records set on this name; only their keys are served. */
  readonly records?: {
    readonly texts?: readonly V1TextRecord[]
    readonly addresses?: readonly V1AddressRecord[]
  }
}

const wrapperFuses = (n: MockV1Name): number =>
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

const hasResolver = (n: MockV1Name) => Boolean(n.records) || isWrapped(n)

/** The bigname record for a mock ENSv1 .eth 2LD, as a detail lookup returns it. */
function v1Record(n: MockV1Name) {
  const now = Math.floor(Date.now() / 1000)
  const expiry = String(n.expiryDate ?? now + 365 * 24 * 60 * 60)
  const owner = n.ownerAddress.toLowerCase()
  return {
    name: n.name,
    display_name: n.name,
    namespace: 'ens',
    namehash: namehash(n.name),
    owner,
    manager: owner,
    registered_at: String(now),
    created_at: String(now),
    expires_at: expiry,
    status: 'active',
    authority: 'ens_v1',
    ens_v1: isWrapped(n)
      ? {
          expires_at: expiry,
          wrapper_state: n.type === 'locked' ? 'locked' : 'emancipated',
          wrapper_fuses: fuseFlags(wrapperFuses(n)),
          wrapper_expires_at: expiry,
        }
      : { expires_at: expiry, wrapper_state: 'unwrapped' },
    ...(hasResolver(n) && {
      resolver: { chain_id: CHAIN_ID, address: V1_PUBLIC_RESOLVER },
      records: {
        seen_addresses:
          n.records?.addresses?.map(({ coinType }) => String(coinType)) ?? [],
        addresses: {},
        seen_texts: n.records?.texts?.map(({ key }) => key) ?? [],
        texts: {},
        seen_abis: [],
        abis: {},
        seen_singletons: [],
      },
    }),
    read_status: 'ok',
  }
}

/** The name's record inventory, as `/v1/resolvers/{c}/{a}/records` serves it. */
function v1ResolverRecords(n: MockV1Name) {
  return {
    data: {
      namespace: 'ens',
      resolver: { chain_id: CHAIN_ID, address: V1_PUBLIC_RESOLVER },
      records: {},
      inventory: {
        known_keys: [
          ...(n.records?.texts?.map(({ key }) => `text:${key}`) ?? []),
          ...(n.records?.addresses?.map(({ coinType }) => `addr:${coinType}`) ??
            []),
        ],
        unset_keys: [],
        unsupported_keys: [],
        abi_content_types: [],
      },
    },
    meta: META,
  }
}

/** The ENSv1 names page for an `authority=ens_v1` address names request. */
function v1Listing(url: URL, mockNames: readonly MockV1Name[]) {
  const address = url.pathname
    .match(/^\/v1\/addresses\/([^/]+)\/names$/)?.[1]
    ?.toLowerCase()
  const isV1Listing =
    url.searchParams.get('authority')?.split(',').includes('ens_v1') ?? false
  if (!address || !isV1Listing) return undefined
  const rows = mockNames
    .filter((n) => n.ownerAddress.toLowerCase() === address)
    .map((n) => ({ ...v1Record(n), relations: ['owner'], is_primary: false }))
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
    meta: META,
  }
}

/** The mock name a resolver records request asks for, if it uses that resolver. */
function nameAtResolver(url: URL, byName: ReadonlyMap<string, MockV1Name>) {
  const resolver = url.pathname.match(
    /^\/v1\/resolvers\/\d+\/([^/]+)\/records$/,
  )?.[1]
  const n = byName.get(url.searchParams.get('name')?.toLowerCase() ?? '')
  return resolver?.toLowerCase() === V1_PUBLIC_RESOLVER && n && hasResolver(n)
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

  const fulfill = (route: Route, json: unknown) =>
    route.fulfill({ status: 200, json, headers: CORS_HEADERS })

  await page.route(/bigname\.sh\/v1\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (isMigrated) return route.fallback()
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    }

    const listing = v1Listing(url, mockNames)
    if (listing) return fulfill(route, listing)

    const atResolver = nameAtResolver(url, byName)
    if (atResolver) return fulfill(route, v1ResolverRecords(atResolver))

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
              ? { input, kind: 'name', status: 'ok', record: v1Record(n) }
              : { input, kind: 'name', status: 'not_found' }
          }),
          meta: META,
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
