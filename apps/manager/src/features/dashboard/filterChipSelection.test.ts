import { describe, expect, it } from 'vitest'
import type { FilterChipDef } from './components/FilterChips'
import { firstOpenChip, resolveSelectedChip } from './filterChipSelection'

type Key = 'owned' | 'favorites' | 'subnames'

const chips = (
  counts: Readonly<Partial<Record<Key, number>>>,
  disabled: readonly Key[] = [],
): readonly FilterChipDef<Key>[] =>
  (['owned', 'favorites', 'subnames'] as const).map((value) => ({
    value,
    label: value,
    count: counts[value],
    disabled: disabled.includes(value),
  }))

describe('resolveSelectedChip', () => {
  it.each([
    ['keeps a selection with names', { subnames: 2 }, 'subnames', 'subnames'],
    ['keeps a selection still counting', {}, 'subnames', 'subnames'],
    [
      'falls back once the selection is empty',
      { subnames: 0 },
      'subnames',
      null,
    ],
    ['keeps no selection', { subnames: 0 }, null, null],
  ] as const)('%s', (_, counts, value, expected) => {
    expect(resolveSelectedChip(chips(counts), value, null)).toBe(expected)
  })
})

describe('firstOpenChip', () => {
  it.each([
    ['skips an empty chip', { owned: 0, favorites: 3 }, [], 'favorites'],
    ['skips a disabled chip', { owned: 0 }, ['favorites'], 'subnames'],
    [
      'falls back when every chip is empty or disabled',
      { owned: 0, subnames: 0 },
      ['favorites'],
      'owned',
    ],
  ] as const)('%s', (_, counts, disabled, expected) => {
    expect(firstOpenChip(chips(counts, disabled), 'owned')).toBe(expected)
  })
})
