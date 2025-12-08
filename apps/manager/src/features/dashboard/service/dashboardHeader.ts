import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { MOCK_DASHBOARD_HEADER } from '../MOCK'

// biome-ignore lint/correctness/useYield: mock implementation returns static data
export const getDashboardHeader = ResultFn(async function* () {
  return ok(MOCK_DASHBOARD_HEADER)
})

export const dashboardHeaderQuery = () =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'header'),
    queryFn: () => getDashboardHeader(),
  })
