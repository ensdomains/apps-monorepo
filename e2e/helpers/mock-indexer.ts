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
 *
 * It also covers two portal-only, count-shaped queries that back the
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

export type MockDomain = {
  name: string
  owner: string
  resolver?: string
  expiryDate?: number
  createdAt?: number
  records?: { key: string; value: string }[]
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIndexerMock() {
  const domains: MockDomain[] = []

  function addName(domain: MockDomain) {
    domains.push(domain)
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
              total: { __typename: 'DomainConnection', totalCount: null },
              own: { __typename: 'DomainConnection', totalCount: null },
            },
          }
        }
        const ownCount = occupants.count - occupants.thirdPartyCount
        return {
          data: {
            registry: { __typename: 'Registry', labelCount: occupants.count },
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
    //   https://staging-graphql.ens.dev/  (the sepolia profile default)
    const pattern =
      /:5655\/graphql(?!\.)|\/indexer\/graphql(?!\.)|staging-graphql\.ens\.dev/
    await page.route(pattern, routeHandler)
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
    domains,
    enabled,
    setRegistryOccupants,
    setSubregistryHistory,
  }
}
