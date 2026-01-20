import type { OrderDirection } from '@ens-apps/indexer'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import type { FavoriteEntry } from '../../hooks/useFavorites'
import {
  filterFavoritesBySearch,
  paginateFavorites,
  sortFavorites,
} from './favorites.helpers'

export type FavoritesQueryVariables = {
  readonly favorites: readonly FavoriteEntry[]
  readonly page: number
  readonly pageSize: number
  readonly sortField: 'name' | 'addedAt'
  readonly sortDirection: OrderDirection
  readonly searchQuery?: string
}

export const getFavoritesQuery = (
  variables: FavoritesQueryVariables | undefined,
) =>
  queryOptions({
    queryKey: qk('dashboard', 'favorites', variables ?? {}),
    queryFn: variables
      ? () => {
          const {
            favorites,
            page,
            pageSize,
            sortField,
            sortDirection,
            searchQuery,
          } = variables

          const filteredFavorites = filterFavoritesBySearch(
            favorites,
            searchQuery,
          )
          const sortedFavorites = sortFavorites(
            filteredFavorites,
            sortField,
            sortDirection,
          )

          return paginateFavorites(sortedFavorites, page, pageSize)
        }
      : skipToken,
  })
