import { describe, expect, it } from 'vitest'
import { resolveNamesFilter, shouldShowFavoritesFilter } from './namesFilter'

describe('shouldShowFavoritesFilter', () => {
  it.each([
    ['signed in with favorites', true, 3, 'owned', true],
    ['signed in with none', true, 0, 'owned', false],
    ['emptied while selected', true, 0, 'favorites', true],
    ['signed out', false, 3, 'owned', false],
    ['signed out while selected', false, 3, 'favorites', false],
  ] as const)('%s: %s', (_, isAuthed, favoritesCount, filter, expected) => {
    expect(
      shouldShowFavoritesFilter({ isAuthed, favoritesCount, filter }),
    ).toBe(expected)
  })
})

describe('resolveNamesFilter', () => {
  it.each([
    [
      'keeps favorites selected after the last one is removed',
      'favorites',
      true,
      'favorites',
    ],
    ['keeps owned when favorites appear', 'owned', true, 'owned'],
    ['shows owned names while signed out', 'favorites', false, 'owned'],
  ] as const)('%s', (_, filter, isAuthed, expected) => {
    expect(resolveNamesFilter(filter, isAuthed)).toBe(expected)
  })
})
