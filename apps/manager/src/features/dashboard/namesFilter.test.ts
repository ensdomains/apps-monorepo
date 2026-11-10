import { describe, expect, it } from 'vitest'
import { resolveNamesFilter, shouldShowFavoritesFilter } from './namesFilter'

describe('shouldShowFavoritesFilter', () => {
  it.each([
    [true, 3, true],
    [true, 0, false],
    [false, 0, false],
    [false, 3, false],
  ])(
    'signed in %s with %i favorites shows the chip: %s',
    (isAuthed, favoritesCount, expected) => {
      expect(shouldShowFavoritesFilter({ isAuthed, favoritesCount })).toBe(
        expected,
      )
    },
  )
})

describe('resolveNamesFilter', () => {
  it('falls back to owned names once the last favorite is gone', () => {
    expect(
      resolveNamesFilter('favorites', { isAuthed: true, favoritesCount: 0 }),
    ).toBe('owned')
  })

  it('keeps favorites while there are some', () => {
    expect(
      resolveNamesFilter('favorites', { isAuthed: true, favoritesCount: 2 }),
    ).toBe('favorites')
  })
})
