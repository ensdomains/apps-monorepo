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

  const addMutation = useMutation(addFavoriteMutationOptions)
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const addFavorite = useCallback(
    (label: string) => {
      const normalizedLabel = label.toLowerCase()
      const exists = favorites.some(
        (entry) => entry.name.toLowerCase() === normalizedLabel,
      )

      if (exists) return

      // Optimistically update the cache
      queryClient.setQueryData(
        favoritesQueryOptions.queryKey,
        (old: readonly ApiFavoriteEntry[] | undefined) => [
          ...(old ?? []),
          { name: label, created_at: new Date().toISOString() },
        ],
      )

      addMutation.mutate(
        { name: label },
        {
          onError: () => {
            // Revert optimistic update on error
            queryClient.invalidateQueries({
              queryKey: favoritesQueryOptions.queryKey,
            })
          },
        },
      )
    },
    [favorites, addMutation, queryClient],
  )

  const removeFavorite = useCallback(
    (label: string) => {
      const normalizedLabel = label.toLowerCase()

      // Optimistically update the cache
      queryClient.setQueryData(
        favoritesQueryOptions.queryKey,
        (old: readonly ApiFavoriteEntry[] | undefined) =>
          (old ?? []).filter(
            (entry) => entry.name.toLowerCase() !== normalizedLabel,
          ),
      )

      removeMutation.mutate(
        { name: label },
        {
          onError: () => {
            // Revert optimistic update on error
            queryClient.invalidateQueries({
              queryKey: favoritesQueryOptions.queryKey,
            })
          },
        },
      )
    },
    [removeMutation, queryClient],
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
