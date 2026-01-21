import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addFavoriteMutationOptions } from '../service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import {
  type FavoriteEntry as ApiFavoriteEntry,
  favoritesQueryOptions,
} from '../service/queries/getFavorites'

export type FavoriteEntry = {
  readonly label: string
  readonly addedAt: number
}

const toLocalEntry = (entry: ApiFavoriteEntry): FavoriteEntry => ({
  label: entry.name,
  addedAt: new Date(entry.created_at).getTime(),
})

export const useFavorites = () => {
  const queryClient = useQueryClient()

  const { data: favorites = [], isLoading } = useQuery(favoritesQueryOptions)

  const localFavorites: readonly FavoriteEntry[] = favorites.map(toLocalEntry)

  const addMutation = useMutation({
    ...addFavoriteMutationOptions,
    onMutate: async ({ name }) => {
      await queryClient.cancelQueries({
        queryKey: favoritesQueryOptions.queryKey,
      })

      const previousFavorites = queryClient.getQueryData<
        readonly ApiFavoriteEntry[]
      >(favoritesQueryOptions.queryKey)

      // Skip if already exists
      const exists = previousFavorites?.some(
        (entry) => entry.name.toLowerCase() === name.toLowerCase(),
      )
      if (exists) return { previousFavorites, skipped: true }

      queryClient.setQueryData<readonly ApiFavoriteEntry[]>(
        favoritesQueryOptions.queryKey,
        (old) => [
          ...(old ?? []),
          { name, created_at: new Date().toISOString() },
        ],
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
      queryClient.invalidateQueries({
        queryKey: favoritesQueryOptions.queryKey,
      })
    },
  })

  const removeMutation = useMutation({
    ...removeFavoriteMutationOptions,
    onMutate: async ({ name }) => {
      await queryClient.cancelQueries({
        queryKey: favoritesQueryOptions.queryKey,
      })

      const previousFavorites = queryClient.getQueryData<
        readonly ApiFavoriteEntry[]
      >(favoritesQueryOptions.queryKey)

      queryClient.setQueryData<readonly ApiFavoriteEntry[]>(
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
      queryClient.invalidateQueries({
        queryKey: favoritesQueryOptions.queryKey,
      })
    },
  })

  const isFavorite = (label: string) =>
    favorites.some((entry) => entry.name.toLowerCase() === label.toLowerCase())

  const toggleFavorite = (label: string) => {
    if (isFavorite(label)) {
      removeMutation.mutate({ name: label })
    } else {
      addMutation.mutate({ name: label })
    }
  }

  return {
    favorites: localFavorites,
    favoritesCount: favorites.length,
    isLoading,
    toggleFavorite,
    isFavorite,
  }
}
