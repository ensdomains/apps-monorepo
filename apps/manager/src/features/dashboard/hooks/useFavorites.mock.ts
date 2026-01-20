import type { FavoriteEntry } from './useFavorites'

export const MOCK_FAVORITES: readonly FavoriteEntry[] = [
  { label: 'seraphinalee.eth', addedAt: Date.now() - 5 * 24 * 60 * 60 * 1000 },
  { label: 'zenithnova.eth', addedAt: Date.now() - 4 * 24 * 60 * 60 * 1000 },
  { label: 'luminaquest.eth', addedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 },
  { label: 'astralvoyager.eth', addedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 },
  {
    label: 'celestialharbor.eth',
    addedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
]
