/**
 * Mock Indexer — intercepts bigname REST requests in Playwright tests.
 *
 * The local chain is not indexed by any bigname deployment, so this helper
 * uses `page.route()` to answer the manager's bigname reads from names the
 * test registers.
 *
 * Usage:
 *   const indexerMock = createIndexerMock()
 *   await indexerMock.install(page)
 *   // ... register a name on-chain ...
 *   indexerMock.addName({ name: 'foo.eth', owner: '0x...' })
 *   // the next names, detail, records and lookup reads include it
 */
import type { Page, Route } from '@playwright/test'
import { namehash } from 'viem'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockRelation = 'owner' | 'manager' | 'role_holder'

export type MockDomain = {
  name: string
  /** The address the name is listed for. */
  owner: string
  resolver?: string
  /** Registrar expiry, unix seconds. An ENSv2 name past it is in grace. */
  expiryDate?: number
  createdAt?: number
  records?: { key: string; value: string }[]
  /** Defaults to ENSv2. */
  readonly protocol?: 'v1' | 'v2'
  /** How `owner` relates to the name; defaults to owner and manager. */
  readonly relations?: readonly MockRelation[]
}

/**
 * Placeholder resolver address used when a fixture carries text records but no
 * explicit resolver. Only its presence matters — record values are read
 * on-chain via ensjs, not from this mock.
 */
const MOCK_RESOLVER_ADDRESS = '0x0000000000000000000000000000000000000001'
const CHAIN_ID = 11155111
type LookupBody = { readonly inputs?: readonly { readonly name?: string }[] }

const META = { as_of: {} }
const DEFAULT_RELATIONS: readonly MockRelation[] = ['owner', 'manager']
const AUTHORITIES = { v1: ['ens_v1', 'ens_v0'], v2: ['ens_v2'] } as const
const SORT_KEYS = ['name', 'expires_at', 'created_at', 'registered_at'] as const
type SortKey = (typeof SORT_KEYS)[number]
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIndexerMock() {
  const domains: MockDomain[] = []

  function addName(domain: MockDomain) {
    domains.push(domain)
  }

  function removeName(name: string) {
    const index = domains.findIndex((d) => d.name === name)
    if (index >= 0) domains.splice(index, 1)
  }

  const findDomain = (name: string) =>
    domains.find((d) => d.name.toLowerCase() === name.toLowerCase())

  const resolverOf = (d: MockDomain) =>
    d.resolver ?? ((d.records?.length ?? 0) > 0 ? MOCK_RESOLVER_ADDRESS : null)

  const nowSeconds = () => Math.floor(Date.now() / 1000)
  const expiryOf = (d: MockDomain) =>
    d.expiryDate ?? nowSeconds() + 28 * 24 * 3600
  const createdOf = (d: MockDomain) => d.createdAt ?? nowSeconds() - 3600
  // bigname drops an expired ENSv2 name from its holder's relations; the
  // holder is its former owner until the name is registered again.
  const isLapsed = (d: MockDomain) =>
    d.protocol !== 'v1' && expiryOf(d) <= nowSeconds()

  function nameFields(d: MockDomain) {
    const resolver = resolverOf(d)
    const owner = d.owner.toLowerCase()
    const expiresAt = String(expiryOf(d))
    return {
      name: d.name,
      display_name: d.name,
      namespace: 'ens',
      namehash: namehash(d.name),
      registered_at: String(createdOf(d)),
      created_at: String(createdOf(d)),
      expires_at: expiresAt,
      ...(isLapsed(d)
        ? {
            registration_status: 'released',
            lapsed_registration: { owner, release_kind: 'expired' },
          }
        : { owner, manager: owner, registration_status: 'registered' }),
      ...(d.protocol === 'v1'
        ? { authority: 'ens_v1', ens_v1: { expires_at: expiresAt } }
        : { authority: 'ens_v2' }),
      ...(resolver && { resolver: { chain_id: CHAIN_ID, address: resolver } }),
    }
  }

  const sortValue = (d: MockDomain, key: SortKey): string | number =>
    key === 'name' ? d.name : key === 'expires_at' ? expiryOf(d) : createdOf(d)

  // bigname's order: the field in the requested direction, then the namehash.
  const compareBy =
    (key: SortKey, order: string) => (a: MockDomain, b: MockDomain) => {
      const left = sortValue(a, key)
      const right = sortValue(b, key)
      const byField =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right)
      const byHash = namehash(a.name) < namehash(b.name) ? -1 : 1
      return (order === 'desc' ? -byField : byField) || byHash
    }

  function recordGroups(d: MockDomain) {
    if (!resolverOf(d)) return undefined
    return {
      seen_addresses: [],
      addresses: {},
      seen_texts: d.records?.map((r) => r.key) ?? [],
      texts: {},
      seen_abis: [],
      abis: {},
      seen_singletons: [],
    }
  }

  const relationsOf = (d: MockDomain): readonly string[] =>
    isLapsed(d) ? ['former_owner'] : (d.relations ?? DEFAULT_RELATIONS)

  const matchesText = (d: MockDomain, params: URLSearchParams) => {
    const q = params.get('q')?.toLowerCase()
    if (!q) return true
    const name = d.name.toLowerCase()
    return params.get('match') === 'contains'
      ? name.includes(q)
      : name.startsWith(q)
  }

  // The query filters of `GET /v1/addresses/{address}/names`.
  const toFilter = (address: string, params: URLSearchParams) => {
    const wanted = params.get('relation') ?? 'any'
    const authorities = params.get('authority')?.split(',') ?? null
    const expiresAfter = Number(params.get('expires_after') ?? -Infinity)
    const expiresBefore = Number(params.get('expires_before') ?? Infinity)
    const isMigratedOnly = params.get('is_migrated') === 'true'
    const isEthChildOnly = params.get('parent') === 'eth'
    return (d: MockDomain) =>
      d.owner.toLowerCase() === address.toLowerCase() &&
      (wanted === 'any'
        ? !isLapsed(d)
        : wanted.split(',').some((r) => relationsOf(d).includes(r))) &&
      (!authorities ||
        AUTHORITIES[d.protocol ?? 'v2'].some((a) => authorities.includes(a))) &&
      !isMigratedOnly &&
      (!isEthChildOnly || d.name.split('.').length === 2) &&
      matchesText(d, params) &&
      expiryOf(d) >= expiresAfter &&
      expiryOf(d) < expiresBefore
  }

  // Filters, orders and pages like bigname, with the offset as the cursor.
  function addressNames(address: string, params: URLSearchParams) {
    const sortParam = params.get('sort')
    const sort: SortKey = SORT_KEYS.find((key) => key === sortParam) ?? 'name'
    const pageSize = Number(params.get('page_size') ?? 50)
    const offset = Number(params.get('cursor') ?? 0)
    const matches = domains
      .filter(toFilter(address, params))
      .sort(compareBy(sort, params.get('order') ?? 'asc'))
    const rows = matches.slice(offset, offset + pageSize).map((d) => ({
      ...nameFields(d),
      relations: relationsOf(d),
      is_primary: false,
    }))
    const next = offset + pageSize < matches.length ? offset + pageSize : null
    const hasTotal =
      params.get('include')?.split(',').includes('total_count') ?? false
    return {
      data: rows,
      page: {
        cursor: offset === 0 ? null : String(offset),
        next_cursor: next === null ? null : String(next),
        page_size: pageSize,
        ...(hasTotal && { total_count: matches.length }),
        has_more: next !== null,
      },
      meta: META,
    }
  }

  function nameRecords(d: MockDomain) {
    const keys = d.records?.map((r) => `text:${r.key}`) ?? []
    return {
      data: {
        namespace: 'ens',
        resolver: resolverOf(d)
          ? { chain_id: CHAIN_ID, address: resolverOf(d) }
          : null,
        records: {},
        inventory: {
          known_keys: keys,
          unset_keys: [],
          unsupported_keys: [],
          abi_content_types: [],
        },
      },
      meta: META,
    }
  }

  function lookup(body: LookupBody | undefined) {
    return {
      data: (body?.inputs ?? []).map((input) => {
        const d = input.name ? findDomain(input.name) : undefined
        if (!d) return { input, kind: 'name', status: 'not_found' }
        const records = recordGroups(d)
        return {
          input,
          kind: 'name',
          status: 'ok',
          record: {
            ...nameFields(d),
            status: 'ok',
            ...(records && { records }),
          },
        }
      }),
      meta: META,
    }
  }

  const notFound = {
    status: 404,
    json: { error: { code: 'not_found', message: 'not found', details: {} } },
  }

  function handle(
    method: string,
    path: string,
    params: URLSearchParams,
    body: LookupBody | undefined,
  ): { readonly status: number; readonly json: unknown } {
    const addressMatch = path.match(/^\/v1\/addresses\/([^/]+)\/names$/)
    if (addressMatch?.[1]) {
      return { status: 200, json: addressNames(addressMatch[1], params) }
    }
    const recordsMatch = path.match(/^\/v1\/names\/([^/]+)\/records$/)
    if (recordsMatch?.[1]) {
      const d = findDomain(decodeURIComponent(recordsMatch[1]))
      return d ? { status: 200, json: nameRecords(d) } : notFound
    }
    const nameMatch = path.match(/^\/v1\/names\/([^/]+)$/)
    if (nameMatch?.[1]) {
      const d = findDomain(decodeURIComponent(nameMatch[1]))
      return d
        ? {
            status: 200,
            json: { data: { ...nameFields(d), status: 'ok' }, meta: META },
          }
        : notFound
    }
    if (method === 'POST' && path === '/v1/lookup') {
      return {
        status: 200,
        json: lookup(body),
      }
    }
    console.log(`[mock-indexer] unhandled bigname route: ${method} ${path}`)
    return { status: 200, json: { data: [], meta: META } }
  }

  async function routeHandler(route: Route) {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS })
      return
    }
    try {
      const url = new URL(request.url())
      const postData = request.postData()
      const body: LookupBody | undefined = postData
        ? JSON.parse(postData)
        : undefined
      const { status, json } = handle(
        request.method(),
        url.pathname,
        url.searchParams,
        body,
      )
      await route.fulfill({ status, json, headers: CORS_HEADERS })
    } catch (err) {
      console.error('[mock-indexer] error handling request:', err)
      await route.fulfill({
        status: 200,
        json: { data: [], meta: META },
        headers: CORS_HEADERS,
      })
    }
  }

  async function install(page: Page) {
    // Any bigname deployment, e.g. https://sepolia.api.bigname.sh/v1/...
    await page.route(/bigname\.sh\/v1\//, routeHandler)
  }

  /** Whether the mock should be active (set E2E_MOCK_INDEXER=true). */
  const enabled = process.env.E2E_MOCK_INDEXER === 'true'

  /** Install only when the flag is on; no-op otherwise. */
  async function installIfEnabled(page: Page) {
    if (!enabled) return
    console.log(
      '[mock-indexer] E2E_MOCK_INDEXER=true — intercepting bigname requests',
    )
    await install(page)
  }

  return { install, installIfEnabled, addName, removeName, domains, enabled }
}
