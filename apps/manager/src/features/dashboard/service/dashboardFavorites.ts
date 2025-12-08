import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { MOCK_FAVORITE_NAMES } from '../MOCK'

// biome-ignore lint/correctness/useYield: mock implementation returns static data
export const getDashboardFavorites = ResultFn(async function* () {
  return ok(MOCK_FAVORITE_NAMES)
})

export const dashboardFavoritesQuery = () =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'favorites'),
    queryFn: () => getDashboardFavorites(),
  })
