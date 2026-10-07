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

export type MockDomain = {
  name: string
  owner: string
  resolver?: string
  expiryDate?: number
  createdAt?: number
  records?: { key: string; value: string }[]
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

  const findDomain = (name: string) =>
    domains.find((d) => d.name.toLowerCase() === name.toLowerCase())

  const resolverOf = (d: MockDomain) =>
    d.resolver ?? ((d.records?.length ?? 0) > 0 ? MOCK_RESOLVER_ADDRESS : null)

  // Mock names are ENSv2 registrations held by `owner`, who also manages them.
  function nameFields(d: MockDomain) {
    const now = Math.floor(Date.now() / 1000)
    const resolver = resolverOf(d)
    return {
      name: d.name,
      display_name: d.name,
      namespace: 'ens',
      namehash: namehash(d.name),
      owner: d.owner.toLowerCase(),
      manager: d.owner.toLowerCase(),
      registration_status: 'registered',
      registered_at: String(d.createdAt ?? now - 3600),
      created_at: String(d.createdAt ?? now - 3600),
      expires_at: String(d.expiryDate ?? now + 28 * 24 * 3600),
      authority: 'ens_v2',
      ...(resolver && { resolver: { chain_id: CHAIN_ID, address: resolver } }),
    }
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

  function addressNames(address: string, params: URLSearchParams) {
    const relation = params.get('relation') ?? 'any'
    const isV1Only =
      params.get('authority')?.split(',').includes('ens_v1') ?? false
    const isMigratedOnly = params.get('is_migrated') === 'true'
    const rows =
      relation === 'former_owner' || isV1Only || isMigratedOnly
        ? []
        : domains
            .filter((d) => d.owner.toLowerCase() === address.toLowerCase())
            .filter(
              (d) =>
                params.get('parent') !== 'eth' ||
                d.name.split('.').length === 2,
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((d) => ({
              ...nameFields(d),
              relations: ['owner', 'manager'],
              is_primary: false,
            }))
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

  return { install, installIfEnabled, addName, domains, enabled }
}
