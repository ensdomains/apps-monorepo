import type { NameSummary } from '@ens-apps/indexer/reads'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DASHBOARD_NAME_ACTIONS,
  getDashboardNamesInfiniteQueryOptions,
} from '@/features/dashboard/service/queries/getDashboardNames'
import { indexer } from '@/lib/indexer'
import { invalidateMigrationQueries } from './MigrationPage.helpers'

vi.mock('@/lib/indexer', () => ({
  indexer: { getNamesForAddress: vi.fn() },
}))

const owner = '0x0000000000000000000000000000000000000001'
const agent = (protocol: NameSummary['protocol']): NameSummary => ({
  name: 'agent.eth',
  displayName: 'agent.eth',
  namehash: '0x01',
  protocol,
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: new Date(2_000_000_000_000),
  servedExpiry: 2_000_000_000n,
  graceEndsAt: null,
  registeredAt: null,
  createdAt: null,
})

let queryClient: QueryClient
let isMigrated: boolean

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  isMigrated = false
  vi.mocked(indexer.getNamesForAddress).mockImplementation(() =>
    okAsync({
      items: [agent(isMigrated ? 'v2' : 'v1')],
      nextCursor: null,
      totalCount: null,
    }),
  )
})

afterEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
})

describe('invalidateMigrationQueries', () => {
  it('reads a migrated name again in the inactive dashboard cache', async () => {
    const options = getDashboardNamesInfiniteQueryOptions(
      {
        addresses: [owner],
        sortField: 'name',
        sortDir: 'asc',
        search: '',
        version: null,
      },
      queryClient,
    )
    await queryClient.fetchInfiniteQuery(options)
    isMigrated = true

    await invalidateMigrationQueries(queryClient)

    const names =
      queryClient
        .getQueryData(options.queryKey)
        ?.pages.flat()
        .flatMap((chunk) => chunk.names) ?? []
    expect(names.map(({ name, protocol }) => [name, protocol])).toEqual([
      ['agent.eth', 'v2'],
    ])
  })

  it('refreshes every dashboard name list', async () => {
    const keys = DASHBOARD_NAME_ACTIONS.map(($action) =>
      qk('dashboard', $action, { addresses: [owner] }),
    )
    await Promise.all(
      keys.map((queryKey) =>
        queryClient.fetchQuery({
          queryKey,
          queryFn: async () => (isMigrated ? 'new' : 'old'),
        }),
      ),
    )
    isMigrated = true

    await invalidateMigrationQueries(queryClient)

    for (const key of keys) expect(queryClient.getQueryData(key)).toBe('new')
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
