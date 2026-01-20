import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions } from '@tanstack/react-query'
import { backendClient } from '@/utils/backend-client'

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
    invalidates: [$qk({ $scope: 'favorites' })],
  },
})
