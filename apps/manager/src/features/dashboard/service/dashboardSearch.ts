import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { MOCK_DASHBOARD_NAMES } from '../MOCK'
import { filterDashboardNames } from '../utils'

// biome-ignore lint/correctness/useYield: mock implementation returns static data
export const searchDashboardNames = ResultFn(async function* (query: string) {
  const filtered = filterDashboardNames(MOCK_DASHBOARD_NAMES, query)

  return ok(filtered)
})

export const dashboardSearchQuery = (query: string) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'search', { query }),
    queryFn: ({ queryKey: [{ query }] }) => searchDashboardNames(query),
    enabled: Boolean(query?.trim().length),
  })
