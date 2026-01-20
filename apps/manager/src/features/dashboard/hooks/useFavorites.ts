import { useCallback, useEffect, useState } from 'react'
import { MOCK_FAVORITES } from './useFavorites.mock'

const FAVORITES_STORAGE_KEY = 'ens-favorites'

export type FavoriteEntry = {
  readonly label: string
  readonly addedAt: number
}

type FavoritesState = {
  readonly entries: readonly FavoriteEntry[]
  readonly notificationsEnabled: boolean
}

const getInitialState = (): FavoritesState => {
  if (typeof window === 'undefined') {
    return import.meta.env.DEV
      ? { entries: MOCK_FAVORITES, notificationsEnabled: true }
      : { entries: [], notificationsEnabled: true }
  }

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as FavoritesState
    }
  } catch {
    // Invalid JSON, return default
  }

  // Return mock data in dev mode, empty in production
  return import.meta.env.DEV
    ? { entries: MOCK_FAVORITES, notificationsEnabled: true }
    : { entries: [], notificationsEnabled: true }
}

const saveState = (state: FavoritesState): void => {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable
  }
}

export const useFavorites = () => {
  const [state, setState] = useState<FavoritesState>(getInitialState)

  // Sync state changes to localStorage
  useEffect(() => {
    saveState(state)
  }, [state])

  const addFavorite = useCallback((label: string) => {
    setState((prev) => {
      const normalizedLabel = label.toLowerCase()
      const exists = prev.entries.some(
        (entry) => entry.label.toLowerCase() === normalizedLabel,
      )

      if (exists) return prev

      return {
        ...prev,
        entries: [...prev.entries, { label, addedAt: Date.now() }],
      }
    })
  }, [])

  const removeFavorite = useCallback((label: string) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.filter(
        (entry) => entry.label.toLowerCase() !== label.toLowerCase(),
      ),
    }))
  }, [])

  const toggleFavorite = useCallback((label: string) => {
    setState((prev) => {
      const normalizedLabel = label.toLowerCase()
      const exists = prev.entries.some(
        (entry) => entry.label.toLowerCase() === normalizedLabel,
      )

      if (exists) {
        return {
          ...prev,
          entries: prev.entries.filter(
            (entry) => entry.label.toLowerCase() !== normalizedLabel,
          ),
        }
      }

      return {
        ...prev,
        entries: [...prev.entries, { label, addedAt: Date.now() }],
      }
    })
  }, [])

  const isFavorite = useCallback(
    (label: string) => {
      return state.entries.some(
        (entry) => entry.label.toLowerCase() === label.toLowerCase(),
      )
    },
    [state.entries],
  )

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      notificationsEnabled: enabled,
    }))
  }, [])

  return {
    favorites: state.entries,
    favoritesCount: state.entries.length,
    notificationsEnabled: state.notificationsEnabled,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    setNotificationsEnabled,
  }
}
