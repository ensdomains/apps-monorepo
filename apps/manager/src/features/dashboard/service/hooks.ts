import type { UseSuspenseQueryResult } from '@tanstack/react-query'
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type { DashboardNameRow } from '../MOCK'
import { dashboardFavoritesQuery } from './dashboardFavorites'
import { dashboardHeaderQuery } from './dashboardHeader'
import { dashboardNamesQuery } from './dashboardNames'
import {
  type DashboardNamesSortDirection,
  type DashboardNamesSortKey,
  dashboardNamesListQuery,
} from './dashboardNamesList'

export const useDashboardHeaderQuery = () =>
  useSuspenseQuery(dashboardHeaderQuery())

export const useDashboardNamesQuery = (): UseSuspenseQueryResult<
  DashboardNameRow[],
  unknown
> => useSuspenseQuery(dashboardNamesQuery())

export const useDashboardFavoritesQuery = () =>
  useSuspenseQuery(dashboardFavoritesQuery())

export const useDashboardNamesListQuery = (params: {
  query?: string
  sortBy: DashboardNamesSortKey
  sortDirection: DashboardNamesSortDirection
  page: number
  pageSize: number
}) =>
  useQuery({
    ...dashboardNamesListQuery(params),
    placeholderData: keepPreviousData,
  })
