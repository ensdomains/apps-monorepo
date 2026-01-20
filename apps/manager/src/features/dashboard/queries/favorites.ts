import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions, queryOptions } from '@tanstack/react-query'
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

export const addFavoriteMutationOptions = mutationOptions({
  mutationFn: async ({ name }: { name: string }) => {
    const response = await backendClient.favorites[':name'].$put({
      param: { name },
    })

    if (!response.ok) {
      throw new Error('Failed to add favorite')
    }

    return response.json()
  },
  meta: {
    invalidates: [
      $qk({
        $scope: 'favorites',
      }),
    ],
  },
})

export const removeFavoriteMutationOptions = mutationOptions({
  mutationFn: async ({ name }: { name: string }) => {
    const response = await backendClient.favorites[':name'].$delete({
      param: { name },
    })

    if (!response.ok) {
      throw new Error('Failed to remove favorite')
    }

    return response.json()
  },
  meta: {
    invalidates: [
      $qk({
        $scope: 'favorites',
      }),
    ],
  },
})
