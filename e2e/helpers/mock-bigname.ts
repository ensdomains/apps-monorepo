/**
 * bigname mock: intercepts bigname REST requests in Playwright tests.
 *
 * The local chain is not indexed by any bigname deployment, so this helper
 * uses `page.route()` to answer the apps' bigname reads from names the
 * test registers.
 *
 * Usage:
 *   const bignameMock = createBignameMock()
 *   await bignameMock.install(page)
 *   // ... register a name on-chain ...
 *   bignameMock.addName({ name: 'foo.eth', owner: '0x...' })
 *   // the next names, detail, records and lookup reads include it
 *
 * It also sets the two counts behind the portal's registry-detach check, for a
 * subregistry bigname has not indexed:
 *   bignameMock.setRegistryOccupants(subregistryAddress, { count: 2, thirdPartyCount: 1 })
 *   bignameMock.setSubregistryHistory(namehash(name), 1)
 */
import type { Page, Route } from '@playwright/test'
import { type Address, namehash } from 'viem'

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
 * Response shape for `getRegistryOccupants` — mirrors portal's
 * `RegistryOccupants` (see `useRegistryOccupants.ts`). `count` is the
 * registry's total subname count; `thirdPartyCount` is however many of those
 * are NOT owned by whoever is about to detach the registry.
 */
export type MockRegistryOccupants = {
  count: number
  thirdPartyCount: number
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
// Past any local block, so a write's indexer-sync wait ends at once.
const STATUS = {
  status: 'ready',
  chains: { [CHAIN_ID]: { indexed_block: Number.MAX_SAFE_INTEGER } },
}
const EMPTY_PAGE = {
  data: [],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 0,
    total_count: 0,
    has_more: false,
  },
  meta: META,
}
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBignameMock() {
  const domains: MockDomain[] = []

  function addName(domain: MockDomain) {
    domains.push(domain)
  }

  function removeName(name: string) {
    const index = domains.findIndex((d) => d.name === name)
    if (index >= 0) domains.splice(index, 1)
  }

  // -------------------------------------------------------------------------
  // Registry occupancy and subregistry history control state
  // -------------------------------------------------------------------------
  // Keyed case-insensitively (addresses and namehashes both arrive lowercased
  // from the app — see useRegistryOccupants.ts / useSubregistrySlot.ts — but
  // callers may pass either case, so normalise on write and read).

  /** `registryAddress.toLowerCase()` -> configured occupants, or `null` for
   * "bigname has not indexed this registry yet" (the fail-closed default). */
  const registryOccupants = new Map<string, MockRegistryOccupants | null>()

  /** `namehash.toLowerCase()` -> configured `SubregistryUpdated` count, or
   * `null` for "the indexer declined to answer" (an error, not a zero). */
  const subregistryHistory = new Map<string, number | null>()

  /**
   * Configure the label counts bigname reports for `registryAddress`.
   *
   * `null` (or never calling this for the address) reproduces exactly the
   * real bug this mock exists to route around: a subregistry bigname hasn't
   * indexed yet answers 404, and
   * `useRegistryDetachImpact` fails closed — same as the unmocked default. A
   * test that wants the "empty subregistry" or "N subnames, M third-party"
   * cases must call this explicitly.
   */
  function setRegistryOccupants(
    registryAddress: Address,
    occupants: MockRegistryOccupants | null,
  ) {
    registryOccupants.set(registryAddress.toLowerCase(), occupants)
  }

  /**
   * Configure how many subregistry links the name's history holds for `nameHash` (a
   * `viem` `namehash()` value).
   *
   * Defaults to `0` ("never configured") for any namehash not explicitly set
   * — the common case for tests that don't care about registry history.
   * Passing `null` reproduces the indexer's "declined to answer" state
   * (`useSubregistrySlot` reads that as `error`, not `never-configured`).
   */
  function setSubregistryHistory(nameHash: string, totalCount: number | null) {
    subregistryHistory.set(nameHash.toLowerCase(), totalCount)
  }

  // -------------------------------------------------------------------------
  // bigname REST (manager)
  // -------------------------------------------------------------------------

  const findDomain = (name: string) =>
    domains.find((d) => d.name.toLowerCase() === name.toLowerCase())

  const resolverOf = (d: MockDomain) =>
    d.resolver ?? ((d.records?.length ?? 0) > 0 ? MOCK_RESOLVER_ADDRESS : null)

  const nowSeconds = () => Math.floor(Date.now() / 1000)
  const expiryOf = (d: MockDomain) =>
    d.expiryDate ?? nowSeconds() + 28 * 24 * 3600
  const createdOf = (d: MockDomain) => d.createdAt ?? nowSeconds() - 3600
  const isPastExpiry = (d: MockDomain) => expiryOf(d) <= nowSeconds()
  // bigname drops an expired ENSv2 name from its holder's relations; the
  // holder is its former owner until the name is registered again.
  const isLapsed = (d: MockDomain) => d.protocol !== 'v1' && isPastExpiry(d)
  // ENSv2 grace is 28 days; an ENSv1 lease's is 90.
  const graceEndOf = (d: MockDomain) =>
    expiryOf(d) + (d.protocol === 'v1' ? 90 : 28) * 24 * 3600

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
      grace_ends_at: String(graceEndOf(d)),
      ...(isLapsed(d)
        ? {
            status: 'expired',
            lapsed_registration: { owner, release_kind: 'expired' },
          }
        : {
            owner,
            manager: owner,
            // An ENSv1 name in grace keeps its owner but reads expired.
            status: isPastExpiry(d) ? 'expired' : 'active',
          }),
      ...(d.protocol === 'v1'
        ? {
            authority: 'ens_v1',
            ens_v1: {
              expires_at: expiresAt,
              resolver: resolver
                ? { chain_id: CHAIN_ID, address: resolver }
                : null,
            },
          }
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
            read_status: 'ok',
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

  type Reply = { readonly status: number; readonly json: unknown }
  type Request = {
    readonly match: RegExpMatchArray
    readonly params: URLSearchParams
    readonly body: LookupBody | undefined
  }

  const ok = (json: unknown): Reply => ({ status: 200, json })
  const withDomain =
    (reply: (d: MockDomain) => unknown) =>
    ({ match }: Request): Reply => {
      const d = findDomain(decodeURIComponent(match[1] ?? ''))
      return d ? ok(reply(d)) : notFound
    }

  const ROUTES: readonly {
    readonly method: string
    readonly path: RegExp
    readonly reply: (request: Request) => Reply
  }[] = [
    {
      method: 'GET',
      path: /^\/v1\/addresses\/([^/]+)\/names$/,
      reply: ({ match, params }) => ok(addressNames(match[1] ?? '', params)),
    },
    {
      method: 'GET',
      path: /^\/v1\/registries\/\d+\/([^/]+)\/labels$/,
      reply: ({ match, params }) => {
        const occupants = registryOccupants.get(match[1]?.toLowerCase() ?? '')
        if (!occupants) return notFound
        // has_more makes the portal ask for the third-party count separately.
        const count = params.has('exclude_owner')
          ? occupants.thirdPartyCount
          : occupants.count
        return ok({
          ...EMPTY_PAGE,
          page: { ...EMPTY_PAGE.page, has_more: true, total_count: count },
        })
      },
    },
    {
      method: 'GET',
      path: /^\/v1\/names\/([^/]+)\/history$/,
      reply: ({ match, params }) => {
        if (params.get('type') !== 'subregistry') return ok(EMPTY_PAGE)
        const links = subregistryHistory.get(
          namehash(decodeURIComponent(match[1] ?? '')).toLowerCase(),
        )
        // null is the indexer declining to answer: no rows, but more to read.
        if (links === null)
          return ok({
            ...EMPTY_PAGE,
            page: { ...EMPTY_PAGE.page, has_more: true },
          })
        return ok({
          ...EMPTY_PAGE,
          data: Array.from({ length: links ?? 0 }, (_, index) => ({
            type: 'subregistry',
            name: decodeURIComponent(match[1] ?? ''),
            block_number: index + 1,
            log_index: 0,
            contract_address: null,
            data: { action: 'subregistry_changed' },
          })),
        })
      },
    },
    // Nothing the tests register has children or indexed events yet.
    {
      method: 'GET',
      path: /^\/v1\/(names\/[^/]+\/(subnames|history)|events)$/,
      reply: () => ok(EMPTY_PAGE),
    },
    {
      method: 'GET',
      path: /^\/v1\/names\/([^/]+)\/records$/,
      reply: withDomain(nameRecords),
    },
    {
      method: 'GET',
      path: /^\/v1\/names\/([^/]+)$/,
      reply: withDomain((d) => ({
        data: { ...nameFields(d), read_status: 'ok' },
        meta: META,
      })),
    },
    // A name's records at the resolver it points at.
    {
      method: 'GET',
      path: /^\/v1\/resolvers\/\d+\/([^/]+)\/records$/,
      reply: ({ match, params }) => {
        const d = findDomain(params.get('name') ?? '')
        const resolver = d && resolverOf(d)
        return d && resolver?.toLowerCase() === match[1]?.toLowerCase()
          ? ok(nameRecords(d))
          : notFound
      },
    },
    // A registry or resolver nobody registered is one bigname has not indexed.
    {
      method: 'GET',
      path: /^\/v1\/(registries|resolvers)\/[^/]+\/[^/]+$/,
      reply: () => notFound,
    },
    {
      method: 'GET',
      path: /^\/v1\/status$/,
      reply: () => ok({ data: STATUS, meta: META }),
    },
    {
      method: 'POST',
      path: /^\/v1\/lookup$/,
      reply: ({ body }) => ok(lookup(body)),
    },
  ]

  function handle(
    method: string,
    path: string,
    params: URLSearchParams,
    body: LookupBody | undefined,
  ): Reply {
    for (const route of ROUTES) {
      const match = method === route.method ? path.match(route.path) : null
      if (match) return route.reply({ match, params, body })
    }
    console.log(`[mock-bigname] unhandled bigname route: ${method} ${path}`)
    return notFound
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
      console.error('[mock-bigname] error handling request:', err)
      await route.fulfill({
        status: 500,
        json: {
          error: { code: 'internal', message: String(err), details: {} },
        },
        headers: CORS_HEADERS,
      })
    }
  }

  async function install(page: Page) {
    // Any bigname deployment, e.g. https://sepolia.api.bigname.sh/v1/..., and
    // the local one (e2e/infra/bigname) for a CI-mode run against a dev server
    // that points at it.
    await page.route(/bigname\.sh\/v1\/|:5660\/v1\//, routeHandler)
  }

  /** Whether the mock should be active (set E2E_MOCK_BIGNAME=true). */
  const enabled = process.env.E2E_MOCK_BIGNAME === 'true'

  /** Install only when the flag is on; no-op otherwise. */
  async function installIfEnabled(page: Page) {
    if (!enabled) return
    console.log(
      '[mock-bigname] E2E_MOCK_BIGNAME=true — intercepting bigname requests',
    )
    await install(page)
  }

  return {
    install,
    installIfEnabled,
    addName,
    removeName,
    domains,
    enabled,
    setRegistryOccupants,
    setSubregistryHistory,
  }
}
