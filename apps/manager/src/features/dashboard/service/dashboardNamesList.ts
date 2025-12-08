import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { type DashboardNameRow, MOCK_DASHBOARD_NAMES } from '../MOCK'
import { filterDashboardNames } from '../utils'

export type DashboardNamesSortKey = 'name' | 'expiry'
export type DashboardNamesSortDirection = 'asc' | 'desc'

const sortNames = (
  list: DashboardNameRow[],
  sortBy: DashboardNamesSortKey,
  sortDirection: DashboardNamesSortDirection,
) => {
  const sorted = [...list].sort((a, b) => {
    if (sortBy === 'expiry') {
      const aExpiry = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY
      const bExpiry = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY

      return aExpiry - bExpiry
    }

    return a.name.localeCompare(b.name)
  })

  return sortDirection === 'asc' ? sorted : sorted.reverse()
}

// biome-ignore lint/correctness/useYield: mock implementation returns static data
export const getDashboardNamesList = ResultFn(async function* (params: {
  query?: string
  sortBy: DashboardNamesSortKey
  sortDirection: DashboardNamesSortDirection
  page: number
  pageSize: number
}) {
  const { query = '', sortBy, sortDirection, page, pageSize } = params

  const filtered = filterDashboardNames(MOCK_DASHBOARD_NAMES, query)
  const sorted = sortNames(filtered, sortBy, sortDirection)

  const total = sorted.length
  const start = Math.max(0, (page - 1) * pageSize)
  const end = Math.max(start, start + pageSize)
  const items = sorted.slice(start, end)

  return ok({ items, total })
})

export const dashboardNamesListQuery = (params: {
  query?: string
  sortBy: DashboardNamesSortKey
  sortDirection: DashboardNamesSortDirection
  page: number
  pageSize: number
}) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'names-list', params),
    queryFn: ({
      queryKey: [{ query, sortBy, sortDirection, page, pageSize }],
    }) =>
      getDashboardNamesList({
        query,
        sortBy,
        sortDirection,
        page,
        pageSize,
      }),
  })
