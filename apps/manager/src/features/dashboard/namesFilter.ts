export type NamesFilter = 'owned' | 'favorites'

type FavoritesFilterRead = {
  readonly isAuthed: boolean
  readonly favoritesCount: number
}

/** Favorites can only be read signed in, and an empty filter is hidden. */
export const shouldShowFavoritesFilter = ({
  isAuthed,
  favoritesCount,
}: FavoritesFilterRead): boolean => isAuthed && favoritesCount > 0

/** The filter the table shows: owned names once the favorites chip is hidden. */
export const resolveNamesFilter = (
  filter: NamesFilter,
  read: FavoritesFilterRead,
): NamesFilter =>
  filter === 'favorites' && !shouldShowFavoritesFilter(read) ? 'owned' : filter
