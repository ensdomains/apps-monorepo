/**
 * Mock V1 names — answers the manager's bigname reads for ENSv1 names
 * registered on the local Anvil chain, which no bigname deployment indexes.
 *
 * It serves the `authority=ens_v1` listing the migration reads and the detail
 * lookups for these names (fields and record keys). Every other bigname
 * request falls through to the next handler, e.g. the shared indexer mock.
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

/** The bigname record for a mock ENSv1 .eth 2LD, as a detail lookup returns it. */
function v1Record(n: MockV1Name) {
  const now = Math.floor(Date.now() / 1000)
  const expiry = String(n.expiryDate ?? now + 365 * 24 * 60 * 60)
  const isWrapped = n.type === 'wrapped' || n.type === 'locked'
  const hasResolver = Boolean(n.records) || isWrapped
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
    registration_status: isWrapped ? 'wrapped' : 'active',
    authority: 'ens_v1',
    ens_v1: isWrapped
      ? {
          expires_at: expiry,
          wrapper_state: n.type === 'locked' ? 'locked' : 'wrapped',
          wrapper_fuses: fuseFlags(wrapperFuses(n)),
          wrapper_expires_at: expiry,
        }
      : { expires_at: expiry },
    ...(hasResolver && {
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
    status: 'ok',
  }
}

/**
 * Serve mock ENSv1 names from bigname. Call this BEFORE navigating to pages
 * that read the migration list.
 */
export async function mockV1Names(
  page: Page,
  mockNames: readonly MockV1Name[],
): Promise<void> {
  const byName = new Map(mockNames.map((n) => [n.name.toLowerCase(), n]))

  const fulfill = (route: Route, json: unknown) =>
    route.fulfill({ status: 200, json, headers: CORS_HEADERS })

  await page.route(/bigname\.sh\/v1\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    }

    const listing = url.pathname.match(/^\/v1\/addresses\/([^/]+)\/names$/)
    if (listing?.[1] && url.searchParams.get('authority') === 'ens_v1') {
      const address = listing[1].toLowerCase()
      const rows = mockNames
        .filter((n) => n.ownerAddress.toLowerCase() === address)
        .map((n) => ({
          ...v1Record(n),
          relations: ['owner'],
          is_primary: false,
        }))
      console.log(
        `[mock-v1-names] serving ${rows.length} V1 names for ${address}`,
      )
      return fulfill(route, {
        data: rows,
        page: {
          cursor: null,
          next_cursor: null,
          page_size: rows.length,
          total_count: rows.length,
          has_more: false,
        },
        meta: META,
      })
    }

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
}
