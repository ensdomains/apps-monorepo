import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { MOCK_DASHBOARD_NAMES } from '../MOCK'

// biome-ignore lint/correctness/useYield: mock implementation returns static data
export const getDashboardNames = ResultFn(async function* () {
  return ok(MOCK_DASHBOARD_NAMES)
})

export const dashboardNamesQuery = () =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'names'),
    queryFn: () => getDashboardNames(),
  })
