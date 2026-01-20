import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import { backendClient } from '@/utils/backend-client'

export type FavoriteEntry = {
  readonly name: string
  readonly created_at: string
}

export const favoritesQueryOptions = queryOptions({
  queryKey: qk('favorites', 'list'),
  queryFn: async (): Promise<readonly FavoriteEntry[]> => {
    const response = await backendClient.favorites.$get()
    if (!response.ok) {
      throw new Error(`Failed to fetch favorites: ${response.statusText}`)
    }
    return response.json()
  },
  meta: {
    dependsOn: ['backend'],
  },
})
