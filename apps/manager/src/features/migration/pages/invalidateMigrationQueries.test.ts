import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMergedNamesList } from '@/features/dashboard/mergedNames'
import { getAllDomainsInfiniteQuery } from '@/features/dashboard/service/queries/getAllDashboardDomains'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { getDashboardRoleAssignmentsQuery } from '@/features/dashboard/service/queries/getDashboardRoleAssignments'
import { applyV2RoleAssignments } from '@/features/dashboard/v2NameRoles'
import { indexerClient } from '@/lib/indexer-client'
import { invalidateMigrationQueries } from './MigrationPage.helpers'

vi.mock('@/lib/indexer-client', () => ({
  indexerClient: { query: vi.fn() },
}))

const owner = '0x0000000000000000000000000000000000000001'
const migratedDomain: DomainFragment = {
  id: 'agent.eth',
  name: 'agent.eth',
  normalizedName: 'agent.eth',
  tokenId: '1',
  createdAt: 1,
  registrationDate: 1,
  expiryDate: 2_000_000_000,
  resolver: null,
  owner: { id: owner },
}
const variables = {
  where: { owner_in: [owner] },
  orderBy: Domain_OrderBy.Name,
  orderDirection: OrderDirection.Asc,
}

let queryClient: QueryClient
let isMigrated: boolean

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  isMigrated = false
  vi.mocked(indexerClient.query).mockImplementation(
    () =>
      ({
        toPromise: async () => ({
          data: {
            domains: isMigrated ? [migratedDomain] : [],
            roles: isMigrated ? [{ name: 'agent.eth', roleBitmap: '1' }] : [],
          },
        }),
      }) as never,
  )
})

afterEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
})

describe('invalidateMigrationQueries', () => {
  it('makes a migrated name searchable in the inactive dashboard cache', async () => {
    const options = getAllDomainsInfiniteQuery(variables)
    await queryClient.fetchInfiniteQuery(options)
    isMigrated = true

    await invalidateMigrationQueries(queryClient)

    const domains =
      queryClient
        .getQueryData(options.queryKey)
        ?.pages.flatMap((page) => page.domains) ?? []
    const results = buildMergedNamesList({
      v2Names: domains,
      v1Classified: [],
      searchQuery: 'agent',
      sortField: 'created',
      sortDir: 'desc',
    })
    expect(results.map((item) => item.sortName)).toEqual(['agent.eth'])
  })

  it('refreshes cached role assignments for migrated names', async () => {
    const options = getDashboardRoleAssignmentsQuery([owner])
    await queryClient.fetchQuery(options)
    isMigrated = true

    await invalidateMigrationQueries(queryClient)

    const domains = applyV2RoleAssignments(
      [migratedDomain],
      queryClient.getQueryData(options.queryKey) ?? [],
    )
    expect(domains[0]?.nameRoles).toEqual(['owner', 'manager'])
  })

  it('refreshes each cached domain query variant', async () => {
    const options = [
      getDomainsQuery({ ...variables, first: 5, skip: 0 }),
      getDomainsQuery({
        ...variables,
        first: 5,
        skip: 0,
        orderBy: Domain_OrderBy.CreatedAt,
        orderDirection: OrderDirection.Desc,
      }),
    ]
    await Promise.all(options.map((option) => queryClient.fetchQuery(option)))
    isMigrated = true

    await invalidateMigrationQueries(queryClient)

    for (const option of options) {
      expect(
        queryClient
          .getQueryData(option.queryKey)
          ?.domains.map(({ name }) => name),
      ).toEqual(['agent.eth'])
    }
  })

  it('preserves migration invalidation without refetching inactive preflight queries', async () => {
    const activeOptions = {
      queryKey: qk('migration', 'v1_names', { address: owner }),
      queryFn: async () => (isMigrated ? [] : ['agent.eth']),
    }
    await queryClient.fetchQuery(activeOptions)
    const observer = new QueryObserver(queryClient, activeOptions)
    const unsubscribe = observer.subscribe(() => {})
    const preflightKey = ['migration-preflight', { owner }]
    await queryClient.fetchQuery({
      queryKey: preflightKey,
      queryFn: async () => (isMigrated ? 'new plan' : 'old plan'),
    })
    isMigrated = true

    await invalidateMigrationQueries(queryClient)

    expect(queryClient.getQueryData(activeOptions.queryKey)).toEqual([])
    expect(queryClient.getQueryState(preflightKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(preflightKey)).toBe('old plan')
    unsubscribe()
  })

  it('leaves favorites and unrelated profile queries cached', async () => {
    const keys = [
      qk('dashboard', 'favorites'),
      qk('profile', 'get_records', { name: 'other.eth' }),
    ]
    for (const key of keys) queryClient.setQueryData(key, 'cached')

    await invalidateMigrationQueries(queryClient)

    for (const key of keys) {
      expect(queryClient.getQueryData(key)).toBe('cached')
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    }
  })
})
