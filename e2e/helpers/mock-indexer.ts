/**
 * Mock Indexer — intercepts Panoptes GraphQL requests in Playwright tests.
 *
 * When the Panoptes indexer isn't running (e.g. CI), this helper uses
 * `page.route()` to return sensible mock responses so the app doesn't
 * crash with connection-refused errors.
 *
 * Usage:
 *   const indexerMock = createIndexerMock()
 *   await indexerMock.install(page)
 *   // ... register a name on-chain ...
 *   indexerMock.addName({ name: 'foo.eth', owner: '0x...' })
 *   // the next Domains/Domain query will include it
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

type GraphQLBody = {
  operationName?: string
  query?: string
  variables?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIndexerMock() {
  const domains: MockDomain[] = []

  function addName(domain: MockDomain) {
    domains.push(domain)
  }

  function buildDomainFragment(d: MockDomain) {
    const id = namehash(d.name)
    const now = Math.floor(Date.now() / 1000)
    return {
      __typename: 'Domain',
      id,
      name: d.name,
      normalizedName: d.name,
      tokenId: null,
      createdAt: d.createdAt ?? now - 3600,
      expiryDate: d.expiryDate ?? now + 28 * 24 * 3600,
      resolver: d.resolver
        ? {
            __typename: 'Resolver',
            id: `${d.resolver}-${id}`,
            address: d.resolver,
            texts: d.records?.map((r) => r.key) ?? [],
            contentHash: null,
            addresses: [],
          }
        : null,
      owner: { __typename: 'Account', id: d.owner.toLowerCase() },
    }
  }

  function handleRequest(body: GraphQLBody) {
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
        const id = vars.id as string | undefined
        const match = domains.find((d) => namehash(d.name) === id)
        return {
          data: { domain: match ? buildDomainFragment(match) : null },
        }
      }

      case 'OwnedNamesCount': {
        const where = vars.where as Record<string, unknown> | undefined
        let count = domains.length
        if (where?.registrant) {
          const reg = (where.registrant as string).toLowerCase()
          count = domains.filter(
            (d) => d.owner.toLowerCase() === reg,
          ).length
        }
        return {
          data: {
            registrationConnection: { __typename: 'RegistrationConnection', totalCount: count },
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

      default:
        // Unknown operation — return empty data so the app doesn't crash
        console.log(`[mock-indexer] unhandled operation: ${op}`)
        return { data: {} }
    }
  }

  async function routeHandler(route: Route) {
    try {
      const postData = route.request().postData()
      if (!postData) {
        await route.fulfill({ status: 200, json: { data: {} } })
        return
      }
      const body: GraphQLBody = JSON.parse(postData)
      const response = handleRequest(body)
      await route.fulfill({ status: 200, json: response })
    } catch (err) {
      console.error('[mock-indexer] error handling request:', err)
      await route.fulfill({ status: 200, json: { data: {} } })
    }
  }

  async function install(page: Page) {
    // Intercept only the GraphQL API endpoints, not Vite module requests.
    // The (?!\.) lookahead prevents matching file imports like
    // packages/indexer/graphql.gen.ts (which contain "/indexer/graphql.").
    // Matches:
    //   http://127.0.0.1:5655/graphql  (direct)
    //   http://localhost:3000/indexer/graphql  (Vite proxy)
    //   https://staging-graphql.ens.dev/  (SSR fallback)
    const pattern = new RegExp(
      ':5655/graphql(?!\\.)|/indexer/graphql(?!\\.)|staging-graphql\\.ens\\.dev',
    )
    await page.route(pattern, routeHandler)
  }

  /** Whether the mock should be active (set E2E_MOCK_INDEXER=true). */
  const enabled = process.env.E2E_MOCK_INDEXER === 'true'

  /** Install only when the flag is on; no-op otherwise. */
  async function installIfEnabled(page: Page) {
    if (!enabled) return
    console.log('[mock-indexer] E2E_MOCK_INDEXER=true — intercepting indexer requests')
    await install(page)
  }

  return { install, installIfEnabled, addName, domains, enabled }
}
