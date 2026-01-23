import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions } from '@tanstack/react-query'

import { backendClient } from '@/utils/backend-client'
import {
  type FavoriteEntry,
  favoritesQueryOptions,
} from '../queries/getFavorites'

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
  onMutate: async ({ name }, { client }) => {
    await client.cancelQueries({
      queryKey: favoritesQueryOptions.queryKey,
    })
    const previousFavorites = client.getQueryData<readonly FavoriteEntry[]>(
      favoritesQueryOptions.queryKey,
    )
    client.setQueryData<readonly FavoriteEntry[]>(
      favoritesQueryOptions.queryKey,
      (old) =>
        (old ?? []).filter(
          (entry) => entry.name.toLowerCase() !== name.toLowerCase(),
        ),
    )
    return { previousFavorites }
  },
  onError: (_err, _variables, result, { client }) => {
    if (result?.previousFavorites) {
      client.setQueryData(
        favoritesQueryOptions.queryKey,
        result.previousFavorites,
      )
    }
  },
  onSettled: (_data, _error, _variables, _result, { client }) => {
    client.invalidateQueries({ queryKey: favoritesQueryOptions.queryKey })
  },
  meta: {
    invalidates: [$qk({ $scope: 'favorites' })],
  },
})
