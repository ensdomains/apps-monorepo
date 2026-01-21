import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions } from '@tanstack/react-query'
import { queryClient } from '@/router'
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
  onMutate: async ({ name }) => {
    await queryClient.cancelQueries({
      queryKey: favoritesQueryOptions.queryKey,
    })
    const previousFavorites = queryClient.getQueryData<
      readonly FavoriteEntry[]
    >(favoritesQueryOptions.queryKey)
    const exists = previousFavorites?.some(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    )
    if (exists) return { previousFavorites, skipped: true }
    queryClient.setQueryData<readonly FavoriteEntry[]>(
      favoritesQueryOptions.queryKey,
      (old) => [...(old ?? []), { name, created_at: new Date().toISOString() }],
    )
    return { previousFavorites, skipped: false }
  },
  onError: (_err, _variables, context) => {
    if (context?.previousFavorites) {
      queryClient.setQueryData(
        favoritesQueryOptions.queryKey,
        context.previousFavorites,
      )
    }
  },
  onSettled: (_data, _error, _variables, context) => {
    if (context?.skipped) return
    queryClient.invalidateQueries({ queryKey: favoritesQueryOptions.queryKey })
  },
  meta: {
    invalidates: [$qk({ $scope: 'favorites' })],
  },
})
