import { describe, expect, it } from 'vitest'
import {
  filterAndSortOwnedNames,
  is2LD,
  labelCount,
  MAX_SUBNAME_PARENTS,
  mergeOwnedNames,
  subnameParents,
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

  it('returns empty when query is only a TLD like ".eth"', () => {
    expect(filterAndSortOwnedNames(names, '.eth')).toEqual([])
  })

  it('filters by case-insensitive includes', () => {
    const result = filterAndSortOwnedNames(names, 'fox')
    expect(result.map((d) => d.name)).toContain('fox.eth')
    expect(result.map((d) => d.name)).toContain('big.fox.eth')
    expect(result.map((d) => d.name)).not.toContain('other.eth')
  })

  it('strips TLD suffix so "dom.eth" matches names containing "dom"', () => {
    const owned = [
      { name: 'dominico.eth' },
      { name: 'other.eth' },
      { name: 'dom.eth' },
    ]
    const result = filterAndSortOwnedNames(owned, 'dom.eth')
    const resultNames = result.map((d) => d.name)
    expect(resultNames).toContain('dom.eth')
    expect(resultNames).toContain('dominico.eth')
    expect(resultNames).not.toContain('other.eth')
  })

  it('matches partial label without TLD (e.g. "fre" matches "fresh.eth")', () => {
    const owned = [{ name: 'fresh.eth' }, { name: 'other.eth' }]
    const result = filterAndSortOwnedNames(owned, 'fre')
    expect(result.map((d) => d.name)).toContain('fresh.eth')
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

  it('sorts 2LDs before subnames when searching "fox.eth" (TLD stripped to "fox")', () => {
    const result = filterAndSortOwnedNames(names, 'fox.eth')
    const ordered = result.map((d) => d.name)
    // Matches all names containing "fox": arcticfox.eth, fox.eth, notif-fox.eth, big.fox.eth, mini.arcticfox.eth, mini.fox.eth
    expect(ordered[0]).toBe('arcticfox.eth')
    expect(ordered[1]).toBe('fox.eth')
    expect(ordered[2]).toBe('notif-fox.eth')
    expect(ordered[3]).toBe('big.fox.eth')
    expect(ordered[4]).toBe('mini.arcticfox.eth')
    expect(ordered[5]).toBe('mini.fox.eth')
  })

  it('handles subname search by stripping only the TLD', () => {
    const result = filterAndSortOwnedNames(names, 'big.fox.eth')
    const ordered = result.map((d) => d.name)
    // Stripped to "big.fox" — matches names containing "big.fox"
    expect(ordered).toContain('big.fox.eth')
  })

  it('respects max option', () => {
    const result = filterAndSortOwnedNames(names, 'fox', { max: 3 })
    expect(result).toHaveLength(3)
  })

  it('drops the excluded name', () => {
    const result = filterAndSortOwnedNames(names, 'fox', {
      exclude: '  FOX.eth ',
    })
    expect(result.map((d) => d.name)).not.toContain('fox.eth')
    expect(result.map((d) => d.name)).toContain('arcticfox.eth')
  })

  it('applies max after excluding', () => {
    const result = filterAndSortOwnedNames(names, 'fox', {
      max: 3,
      exclude: 'fox.eth',
    })
    expect(result).toHaveLength(3)
    expect(result.map((d) => d.name)).not.toContain('fox.eth')
  })

  it('trims search query', () => {
    const result = filterAndSortOwnedNames(names, '  fox.eth  ')
    expect(result.length).toBeGreaterThan(0)
    expect(result.map((d) => d.name)).toContain('fox.eth')
  })

  it('preserves long subname labels when matching (test.florin matches test.florin.eth)', () => {
    const owned = [
      { name: 'test.florin.eth' },
      { name: 'testing.eth' },
      { name: 'florin.eth' },
    ]
    const result = filterAndSortOwnedNames(owned, 'test.florin')
    const resultNames = result.map((d) => d.name)
    expect(resultNames).toContain('test.florin.eth')
    expect(resultNames).not.toContain('testing.eth')
    expect(resultNames).not.toContain('florin.eth')
  })

  it('still strips short TLD suffixes (test.eth matches names containing "test")', () => {
    const owned = [
      { name: 'test.eth' },
      { name: 'testing.eth' },
      { name: 'other.eth' },
    ]
    const result = filterAndSortOwnedNames(owned, 'test.eth')
    const resultNames = result.map((d) => d.name)
    expect(resultNames).toContain('test.eth')
    expect(resultNames).toContain('testing.eth')
    expect(resultNames).not.toContain('other.eth')
  })

  it('handles trailing dot by stripping it for matching', () => {
    const owned = [
      { name: 'test.florin.eth' },
      { name: 'testing.eth' },
      { name: 'other.eth' },
    ]
    const result = filterAndSortOwnedNames(owned, 'test.')
    const resultNames = result.map((d) => d.name)
    expect(resultNames).toContain('test.florin.eth')
    expect(resultNames).toContain('testing.eth')
    expect(resultNames).not.toContain('other.eth')
  })
})

describe('subnameParents', () => {
  type Parent = Parameters<typeof subnameParents>[0][number]
  const item = (overrides: Partial<Parent>): Parent => ({
    name: 'ensforge.eth',
    protocolVersion: 'ENSv2',
    relations: ['owner', 'manager', 'role_holder'],
    hasNameRow: true,
    subdomainCount: 10,
    ...overrides,
  })

  it('keeps owned ENSv2 names that have subnames', () => {
    // 0x5b7d…ff5d on Sepolia: two of its ENSv2 names have subnames.
    expect(
      subnameParents([
        item({ name: 'alias.ensforge.eth', subdomainCount: 0 }),
        item({ name: 'branch.ensforge.eth', subdomainCount: 1 }),
        item({ name: 'ensforge.eth', subdomainCount: 10 }),
      ]),
    ).toEqual(['branch.ensforge.eth', 'ensforge.eth'])
  })

  it('leaves out ENSv1 names, as the Panoptes list did', () => {
    expect(
      subnameParents([item({ name: 'leon01.eth', protocolVersion: 'ENSv1' })]),
    ).toEqual([])
  })

  it('leaves out names the address does not own', () => {
    expect(
      subnameParents([
        item({ name: 'managed.eth', relations: ['manager'] }),
        item({ name: 'openregistry.eth', relations: ['resolves_to'] }),
      ]),
    ).toEqual([])
  })

  it('leaves out registry children without a name row', () => {
    expect(subnameParents([item({ hasNameRow: false })])).toEqual([])
  })

  it('keeps a name whose subname count is unknown', () => {
    expect(subnameParents([item({ subdomainCount: undefined })])).toEqual([
      'ensforge.eth',
    ])
  })

  it(`stops at ${MAX_SUBNAME_PARENTS} names, in list order`, () => {
    const names = Array.from({ length: 30 }, (_, i) =>
      item({ name: `name${i}.eth` }),
    )

    const parents = subnameParents(names)

    expect(parents).toHaveLength(MAX_SUBNAME_PARENTS)
    expect(parents[0]).toBe('name0.eth')
    expect(parents.at(-1)).toBe('name24.eth')
  })
})

describe('mergeOwnedNames', () => {
  it('appends subnames the address does not already list', () => {
    expect(
      mergeOwnedNames(
        [{ name: 'ensforge.eth' }, { name: 'alias.ensforge.eth' }],
        [
          { name: 'alias.ensforge.eth' },
          { name: 'Different-Owner.ensforge.eth' },
          { name: 'different-owner.ensforge.eth' },
        ],
      ),
    ).toEqual([
      { name: 'ensforge.eth' },
      { name: 'alias.ensforge.eth' },
      { name: 'Different-Owner.ensforge.eth' },
    ])
  })
})
