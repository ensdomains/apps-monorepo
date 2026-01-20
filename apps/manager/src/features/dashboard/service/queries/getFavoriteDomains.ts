import { OrderDirection } from '@ens-apps/indexer'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'
import type { FavoriteEntry } from '../../hooks/useFavorites'

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

          // Filter by search if provided
          const filteredFavorites = searchQuery
            ? favorites.filter((fav) =>
                fav.label.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : favorites

          // Sort favorites
          const sortedFavorites = [...filteredFavorites].sort((a, b) => {
            if (sortField === 'name') {
              const comparison = a.label.localeCompare(b.label)
              return sortDirection === OrderDirection.Asc
                ? comparison
                : -comparison
            }
            // Sort by addedAt
            const comparison = a.addedAt - b.addedAt
            return sortDirection === OrderDirection.Asc
              ? comparison
              : -comparison
          })

          // Paginate
          const startIndex = (page - 1) * pageSize
          const endIndex = startIndex + pageSize
          const paginatedFavorites = sortedFavorites.slice(startIndex, endIndex)

          return {
            favorites: paginatedFavorites,
            totalCount: filteredFavorites.length,
            totalPages: Math.ceil(filteredFavorites.length / pageSize),
            hasNextPage: page < Math.ceil(filteredFavorites.length / pageSize),
            hasPrevPage: page > 1,
            startIndex: startIndex + 1,
            endIndex: Math.min(endIndex, filteredFavorites.length),
          }
        }
      : skipToken,
  })
