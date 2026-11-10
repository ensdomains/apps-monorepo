export type NamesFilter = 'owned' | 'favorites'

type FavoritesFilterRead = {
  readonly isAuthed: boolean
  readonly favoritesCount: number
  readonly filter: NamesFilter
}

/** Favorites need a sign-in; an empty chip hides unless it is the one selected. */
export const shouldShowFavoritesFilter = ({
  isAuthed,
  favoritesCount,
  filter,
}: FavoritesFilterRead): boolean =>
  isAuthed && (favoritesCount > 0 || filter === 'favorites')

/** Owned names show while signed out; otherwise the filter changes only on a click. */
export const resolveNamesFilter = (
  filter: NamesFilter,
  isAuthed: boolean,
): NamesFilter => (!isAuthed && filter === 'favorites' ? 'owned' : filter)
