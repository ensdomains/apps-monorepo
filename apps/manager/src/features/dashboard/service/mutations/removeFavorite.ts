import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions } from '@tanstack/react-query'
import { queryClient } from '@/router'
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
  onMutate: async ({ name }) => {
    await queryClient.cancelQueries({
      queryKey: favoritesQueryOptions.queryKey,
    })
    const previousFavorites = queryClient.getQueryData<
      readonly FavoriteEntry[]
    >(favoritesQueryOptions.queryKey)
    queryClient.setQueryData<readonly FavoriteEntry[]>(
      favoritesQueryOptions.queryKey,
      (old) =>
        (old ?? []).filter(
          (entry) => entry.name.toLowerCase() !== name.toLowerCase(),
        ),
    )
    return { previousFavorites }
  },
  onError: (_err, _variables, context) => {
    if (context?.previousFavorites) {
      queryClient.setQueryData(
        favoritesQueryOptions.queryKey,
        context.previousFavorites,
      )
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: favoritesQueryOptions.queryKey })
  },
  meta: {
    invalidates: [$qk({ $scope: 'favorites' })],
  },
})
