import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
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

      queryClient.setQueryData<readonly ApiFavoriteEntry[]>(
        favoritesQueryOptions.queryKey,
        (old) => [
          ...(old ?? []),
          { name, created_at: new Date().toISOString() },
        ],
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

  const addFavorite = useCallback(
    (label: string) => {
      const normalizedLabel = label.toLowerCase()
      const exists = favorites.some(
        (entry) => entry.name.toLowerCase() === normalizedLabel,
      )

      if (exists) return

      addMutation.mutate({ name: label })
    },
    [favorites, addMutation],
  )

  const removeFavorite = useCallback(
    (label: string) => {
      removeMutation.mutate({ name: label })
    },
    [removeMutation],
  )

  const toggleFavorite = useCallback(
    (label: string) => {
      const normalizedLabel = label.toLowerCase()
      const exists = favorites.some(
        (entry) => entry.name.toLowerCase() === normalizedLabel,
      )

      if (exists) {
        removeFavorite(label)
      } else {
        addFavorite(label)
      }
    },
    [favorites, addFavorite, removeFavorite],
  )

  const isFavorite = useCallback(
    (label: string) => {
      return favorites.some(
        (entry) => entry.name.toLowerCase() === label.toLowerCase(),
      )
    },
    [favorites],
  )

  return {
    favorites: localFavorites,
    favoritesCount: favorites.length,
    isLoading,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
  }
}
