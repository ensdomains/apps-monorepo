import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions } from '@tanstack/react-query'
import { backendClient } from '@/utils/backend-client'
import {
  type FavoriteEntry,
  favoritesQueryOptions,
} from '../queries/getFavorites'

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
  onMutate: async ({ name }, { client }) => {
    await client.cancelQueries({
      queryKey: favoritesQueryOptions.queryKey,
    })
    const previousFavorites = client.getQueryData<readonly FavoriteEntry[]>(
      favoritesQueryOptions.queryKey,
    )
    const exists = previousFavorites?.some(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    )
    if (exists) return { previousFavorites, skipped: true }
    client.setQueryData<readonly FavoriteEntry[]>(
      favoritesQueryOptions.queryKey,
      (old) => [...(old ?? []), { name, created_at: new Date().toISOString() }],
    )
    return { previousFavorites, skipped: false }
  },
  onError: (_err, _variables, result, { client }) => {
    if (result?.previousFavorites) {
      client.setQueryData(
        favoritesQueryOptions.queryKey,
        result.previousFavorites,
      )
    }
  },
  onSettled: (_data, _error, _variables, result, { client }) => {
    if (result?.skipped) return
    client.invalidateQueries({ queryKey: favoritesQueryOptions.queryKey })
  },
  meta: {
    invalidates: [$qk({ $scope: 'favorites' })],
  },
})
