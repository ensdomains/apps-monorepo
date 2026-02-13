import { describe, expect, it } from 'vitest'
import {
  filterAndSortOwnedNames,
  is2LD,
  labelCount,
  mergeOwnedNames,
} from './ownedNamesUtils'

describe('labelCount', () => {
  it('returns 2 for 2LD names', () => {
    expect(labelCount('fox.eth')).toBe(2)
    expect(labelCount('arcticfox.eth')).toBe(2)
  })

  it('returns 3+ for subnames', () => {
    expect(labelCount('big.fox.eth')).toBe(3)
    expect(labelCount('mini.arcticfox.eth')).toBe(3)
    expect(labelCount('a.b.c.eth')).toBe(4)
  })

  it('trims whitespace before counting', () => {
    expect(labelCount('  fox.eth  ')).toBe(2)
  })
})

describe('is2LD', () => {
  it('returns true for exactly two labels', () => {
    expect(is2LD('fox.eth')).toBe(true)
    expect(is2LD('arcticfox.eth')).toBe(true)
  })

  it('returns false for subnames', () => {
    expect(is2LD('big.fox.eth')).toBe(false)
    expect(is2LD('mini.fox.eth')).toBe(false)
  })
})

describe('mergeOwnedNames', () => {
  it('merges v1 and v2 lists', () => {
    const v1 = [{ name: 'v1name.eth' }]
    const v2 = [{ name: 'v2name.eth' }]
    expect(mergeOwnedNames(v1, v2)).toEqual([
      { name: 'v1name.eth' },
      { name: 'v2name.eth' },
    ])
  })

  it('deduplicates by name case-insensitively', () => {
    const v1 = [{ name: 'fox.eth' }]
    const v2 = [{ name: 'Fox.eth' }]
    expect(mergeOwnedNames(v1, v2)).toEqual([{ name: 'fox.eth' }])
  })

  it('skips v1 entries with null name', () => {
    const v1 = [{ name: 'a.eth' }, { name: null }, { name: 'b.eth' }]
    const v2: { name: string }[] = []
    expect(mergeOwnedNames(v1, v2)).toEqual([
      { name: 'a.eth' },
      { name: 'b.eth' },
    ])
  })

  it('returns empty when both inputs empty', () => {
    expect(mergeOwnedNames([], [])).toEqual([])
  })
})

describe('filterAndSortOwnedNames', () => {
  const names: { name: string }[] = [
    { name: 'big.fox.eth' },
    { name: 'fox.eth' },
    { name: 'mini.fox.eth' },
    { name: 'arcticfox.eth' },
    { name: 'notif-fox.eth' },
    { name: 'mini.arcticfox.eth' },
  ]

  it('returns empty when search query is empty', () => {
    expect(filterAndSortOwnedNames(names, '')).toEqual([])
    expect(filterAndSortOwnedNames(names, '   ')).toEqual([])
  })

  it('filters by case-insensitive includes', () => {
    const result = filterAndSortOwnedNames(names, 'fox')
    expect(result.map((d) => d.name)).toContain('fox.eth')
    expect(result.map((d) => d.name)).toContain('big.fox.eth')
    expect(result.map((d) => d.name)).not.toContain('other.eth')
  })

  it('puts 2LD names first, then subnames, alphabetically within each group', () => {
    const result = filterAndSortOwnedNames(names, 'fox')
    const ordered = result.map((d) => d.name)
    // 2LDs that match "fox": arcticfox.eth, fox.eth, notif-fox.eth (notif-fox.eth is 2LD)
    // Subnames: big.fox.eth, mini.fox.eth
    const twoLDs = ordered.filter((n) => n.split('.').length === 2)
    const subnames = ordered.filter((n) => n.split('.').length >= 3)
    expect(twoLDs.length + subnames.length).toBe(ordered.length)
    // All 2LDs should come before any subname
    if (subnames.length > 0 && twoLDs.length > 0) {
      const last2LDIndex = ordered.lastIndexOf(twoLDs[twoLDs.length - 1])
      const firstSubnameIndex = ordered.indexOf(subnames[0])
      expect(last2LDIndex).toBeLessThan(firstSubnameIndex)
    }
    // 2LDs should be sorted alphabetically
    for (let i = 1; i < twoLDs.length; i++) {
      expect(
        twoLDs[i].toLowerCase().localeCompare(twoLDs[i - 1].toLowerCase()),
      ).toBeGreaterThanOrEqual(0)
    }
    // Subnames should be sorted alphabetically
    for (let i = 1; i < subnames.length; i++) {
      expect(
        subnames[i].toLowerCase().localeCompare(subnames[i - 1].toLowerCase()),
      ).toBeGreaterThanOrEqual(0)
    }
  })

  it('sorts 2LDs (fox.eth, arcticfox.eth, notif-fox.eth) before subnames when searching "fox.eth"', () => {
    const result = filterAndSortOwnedNames(names, 'fox.eth')
    const ordered = result.map((d) => d.name)
    // 2LDs containing "fox.eth": arcticfox.eth, fox.eth, notif-fox.eth (alphabetical)
    // Subnames: big.fox.eth, mini.arcticfox.eth, mini.fox.eth (alphabetical)
    expect(ordered[0]).toBe('arcticfox.eth')
    expect(ordered[1]).toBe('fox.eth')
    expect(ordered[2]).toBe('notif-fox.eth')
    expect(ordered[3]).toBe('big.fox.eth')
    expect(ordered[4]).toBe('mini.arcticfox.eth')
    expect(ordered[5]).toBe('mini.fox.eth')
  })

  it('respects max option', () => {
    const result = filterAndSortOwnedNames(names, 'fox', { max: 3 })
    expect(result).toHaveLength(3)
  })

  it('trims search query', () => {
    const result = filterAndSortOwnedNames(names, '  fox.eth  ')
    expect(result.length).toBeGreaterThan(0)
    expect(result.map((d) => d.name)).toContain('fox.eth')
  })
})
