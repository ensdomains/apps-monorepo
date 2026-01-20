import { useCallback, useEffect, useState } from 'react'

const FAVORITES_STORAGE_KEY = 'ens-favorites'

export type FavoriteEntry = {
  label: string
  addedAt: number
}

type FavoritesState = {
  entries: FavoriteEntry[]
  notificationsEnabled: boolean
}

// Mock favorites from Figma design
const MOCK_FAVORITES: FavoriteEntry[] = [
  { label: 'seraphinalee.eth', addedAt: Date.now() - 5 * 24 * 60 * 60 * 1000 },
  { label: 'zenithnova.eth', addedAt: Date.now() - 4 * 24 * 60 * 60 * 1000 },
  { label: 'luminaquest.eth', addedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 },
  { label: 'astralvoyager.eth', addedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 },
  {
    label: 'celestialharbor.eth',
    addedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
]

const getInitialState = (): FavoritesState => {
  if (typeof window === 'undefined') {
    return { entries: MOCK_FAVORITES, notificationsEnabled: true }
  }

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as FavoritesState
    }
  } catch {
    // Invalid JSON, return default with mock data
  }

  // Return mock data as default
  return { entries: MOCK_FAVORITES, notificationsEnabled: true }
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
