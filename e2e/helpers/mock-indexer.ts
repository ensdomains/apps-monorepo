/**
 * Mock Indexer — intercepts indexer requests in Playwright tests.
 *
 * Two indexers sit behind it: the manager reads bigname's REST API, the portal
 * still reads Panoptes GraphQL. When neither runs against the local chain
 * (CI), this helper uses `page.route()` to answer both from names the test
 * registers.
 *
 * Usage:
 *   const indexerMock = createIndexerMock()
 *   await indexerMock.install(page)
 *   // ... register a name on-chain ...
 *   indexerMock.addName({ name: 'foo.eth', owner: '0x...' })
 *   // the next bigname names, detail, records and lookup reads, and the
 *   // next Panoptes Domains/Domain queries, include it
 *
 * It also covers two portal-only, count-shaped Panoptes queries that back the
 * registry-detach feature (PR #1170) — useful when a test wants to control
 * exactly what those counts are instead of waiting for Panoptes to discover
 * a freshly deployed subregistry (a real, currently-flaky CREATE2-discovery
 * path — see e2e/projects/portal/tests/transfer.spec.ts's mocked-indexer
 * describe block):
 *   indexerMock.setRegistryOccupants(subregistryAddress, { count: 2, thirdPartyCount: 1 })
 *   indexerMock.setSubregistryHistory(namehash(name), 1)
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

type GraphQLBody = {
  operationName?: string
  query?: string
  variables?: Record<string, unknown>
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

  // -------------------------------------------------------------------------
  // getRegistryOccupants / getSubregistryUpdateCount control state
  // -------------------------------------------------------------------------
  // Keyed case-insensitively (addresses and namehashes both arrive lowercased
  // from the app — see useRegistryOccupants.ts / useSubregistrySlot.ts — but
  // callers may pass either case, so normalise on write and read).

  /** `registryAddress.toLowerCase()` -> configured occupants, or `null` for
   * "Panoptes hasn't discovered this registry yet" (the fail-closed default —
   * see below). */
  const registryOccupants = new Map<string, MockRegistryOccupants | null>()

  /** `namehash.toLowerCase()` -> configured `SubregistryUpdated` count, or
   * `null` for "the indexer declined to answer" (an error, not a zero). */
  const subregistryHistory = new Map<string, number | null>()

  /**
   * Configure what `getRegistryOccupants` reports for `registryAddress`.
   *
   * `null` (or never calling this for the address) reproduces exactly the
   * real bug this mock exists to route around: a subregistry Panoptes hasn't
   * indexed yet answers `registry(address:)` with `null`, and
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
   * Configure what `getSubregistryUpdateCount` reports for `nameHash` (a
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

  function buildDomainFragment(d: MockDomain) {
    const id = namehash(d.name)
    const now = Math.floor(Date.now() / 1000)
    // Emit a resolver fragment when the fixture provides a resolver address OR
    // when the name carries text records. The app only probes arbitrary text
    // keys (e.g. `agent-registration[...]`) that the indexer reports under
    // `resolver.texts`; static keys like `description` are always probed
    // on-chain regardless. The record VALUES are still read on-chain via ensjs,
    // so a placeholder resolver address is enough for mock-mode discovery.
    const hasRecords = (d.records?.length ?? 0) > 0
    const resolverAddress =
      d.resolver ?? (hasRecords ? MOCK_RESOLVER_ADDRESS : undefined)
    return {
      __typename: 'Domain',
      id,
      name: d.name,
      normalizedName: d.name,
      tokenId: null,
      createdAt: d.createdAt ?? now - 3600,
      expiryDate: d.expiryDate ?? now + 28 * 24 * 3600,
      resolver: resolverAddress
        ? {
            __typename: 'Resolver',
            id: `${resolverAddress}-${id}`,
            address: resolverAddress,
            texts: d.records?.map((r) => r.key) ?? [],
            contentHash: null,
            addresses: [],
          }
        : null,
      owner: { __typename: 'Account', id: d.owner.toLowerCase() },
    }
  }

  // -------------------------------------------------------------------------
  // Panoptes GraphQL (portal)
  // -------------------------------------------------------------------------

  function handleGraphQL(body: GraphQLBody) {
    const op = body.operationName ?? ''
    const vars = body.variables ?? {}

    switch (op) {
      case 'Domains': {
        const where = vars.where as Record<string, unknown> | undefined
        let filtered = [...domains]
        if (where?.owner) {
          const ownerLower = (where.owner as string).toLowerCase()
          filtered = filtered.filter(
            (d) => d.owner.toLowerCase() === ownerLower,
          )
        }
        if (where?.name) {
          filtered = filtered.filter((d) => d.name === where.name)
        }
        if (where?.name_contains_nocase) {
          const needle = (where.name_contains_nocase as string).toLowerCase()
          filtered = filtered.filter((d) =>
            d.name.toLowerCase().includes(needle),
          )
        }
        const skip = (vars.skip as number) ?? 0
        const first = (vars.first as number) ?? 100
        return {
          data: {
            domains: filtered
              .slice(skip, skip + first)
              .map(buildDomainFragment),
          },
        }
      }

      case 'Domain': {
        // The app queries `domain(id: $id)` with the plain ENS name as the id
        // (see profileRecords.ts). Match by name first, falling back to
        // namehash for any caller that passes one.
        const id = vars.id as string | undefined
        const match = domains.find(
          (d) => d.name === id || namehash(d.name) === id,
        )
        return {
          data: { domain: match ? buildDomainFragment(match) : null },
        }
      }

      case 'OwnedNamesCount': {
        const where = vars.where as Record<string, unknown> | undefined
        let count = domains.length
        if (where?.registrant) {
          const reg = (where.registrant as string).toLowerCase()
          count = domains.filter((d) => d.owner.toLowerCase() === reg).length
        }
        return {
          data: {
            registrationConnection: {
              __typename: 'RegistrationConnection',
              totalCount: count,
            },
          },
        }
      }

      case 'MigratedNamesCount': {
        return {
          data: {
            domainConnection: { __typename: 'DomainConnection', totalCount: 0 },
          },
        }
      }

      case 'getRegistryOccupants': {
        // useRegistryOccupants.ts sends both variables pre-lowercased.
        const registryAddress = (
          vars.registry as string | undefined
        )?.toLowerCase()
        const occupants = registryAddress
          ? registryOccupants.get(registryAddress)
          : undefined
        // Unset or explicitly `null` — "undiscovered", the fail-closed
        // default (see setRegistryOccupants's doc comment).
        if (!occupants) {
          return {
            data: {
              registry: null,
              domains: [],
              total: { __typename: 'DomainConnection', totalCount: null },
              own: { __typename: 'DomainConnection', totalCount: null },
            },
          }
        }
        const ownCount = occupants.count - occupants.thirdPartyCount
        return {
          data: {
            registry: { __typename: 'Registry', labelCount: occupants.count },
            // Since #1292 the app takes `count` from the name's own
            // `subdomainsCount` (a registry can be shared by several parents),
            // so the query also asks for `domains(where: { name })`. Without
            // it `domains[0]` throws and the app reports "couldn't check".
            domains: [
              { __typename: 'Domain', subdomainsCount: occupants.count },
            ],
            total: {
              __typename: 'DomainConnection',
              totalCount: occupants.count,
            },
            own: { __typename: 'DomainConnection', totalCount: ownCount },
          },
        }
      }

      case 'getSubregistryUpdateCount': {
        const key = (vars.namehash as string | undefined)?.toLowerCase()
        // Unset -> 0 ("never configured"); explicitly configured (including
        // `null`) -> whatever the test set (see setSubregistryHistory).
        const configured = key ? subregistryHistory.get(key) : undefined
        const totalCount = key && subregistryHistory.has(key) ? configured : 0
        return {
          data: {
            eventConnection: {
              __typename: 'EventConnection',
              totalCount,
            },
          },
        }
      }

      default:
        // Unknown operation — return empty data so the app doesn't crash
        console.log(`[mock-indexer] unhandled operation: ${op}`)
        return { data: {} }
    }
  }

  async function graphqlRouteHandler(route: Route) {
    try {
      const postData = route.request().postData()
      if (!postData) {
        await route.fulfill({ status: 200, json: { data: {} } })
        return
      }
      const body: GraphQLBody = JSON.parse(postData)
      const response = handleGraphQL(body)
      await route.fulfill({ status: 200, json: response })
    } catch (err) {
      console.error('[mock-indexer] error handling request:', err)
      await route.fulfill({ status: 200, json: { data: {} } })
    }
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
            status: 'expired',
            lapsed_registration: { owner, release_kind: 'expired' },
          }
        : { owner, manager: owner, status: 'active' }),
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
            json: { data: { ...nameFields(d), read_status: 'ok' }, meta: META },
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
    // Any bigname deployment, e.g. https://sepolia.api.bigname.sh/v1/..., and
    // the local one (e2e/infra/bigname) for a CI-mode run against a dev server
    // that points at it.
    await page.route(/bigname\.sh\/v1\/|:5660\/v1\//, routeHandler)
    // Intercept only the GraphQL API endpoints, not Vite module requests.
    // The (?!\.) lookahead prevents matching file imports like
    // packages/indexer/graphql.gen.ts (which contain "/indexer/graphql.").
    // Matches:
    //   http://127.0.0.1:5655/graphql  (direct)
    //   http://localhost:3000/indexer/graphql  (Vite proxy)
    //   https://staging-graphql.ens.dev/  (the sepolia profile default)
    const pattern =
      /:5655\/graphql(?!\.)|\/indexer\/graphql(?!\.)|staging-graphql\.ens\.dev/
    await page.route(pattern, graphqlRouteHandler)
  }

  /** Whether the mock should be active (set E2E_MOCK_INDEXER=true). */
  const enabled = process.env.E2E_MOCK_INDEXER === 'true'

  /** Install only when the flag is on; no-op otherwise. */
  async function installIfEnabled(page: Page) {
    if (!enabled) return
    console.log(
      '[mock-indexer] E2E_MOCK_INDEXER=true — intercepting indexer requests',
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
