import type { LookupRecord } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import {
  canRenewFavorite,
  type FavoriteEntry,
  filterFavoritesBySearch,
  filterFavoritesByVersion,
  getFavoriteMetadata,
  paginateFavorites,
  sortFavorites,
} from './favorites.helpers'

const createFavorite = (label: string, addedAt: number): FavoriteEntry => ({
  label,
  addedAt,
})

describe('favorites.helpers', () => {
  describe('filterFavoritesBySearch', () => {
    const favorites: readonly FavoriteEntry[] = [
      createFavorite('alice.eth', 1000),
      createFavorite('bob.eth', 2000),
      createFavorite('charlie.eth', 3000),
      createFavorite('ALICE-2.eth', 4000),
    ]

    it('should return all favorites when searchQuery is undefined', () => {
      const result = filterFavoritesBySearch(favorites, undefined)
      expect(result).toEqual(favorites)
    })

    it('should return all favorites when searchQuery is empty string', () => {
      const result = filterFavoritesBySearch(favorites, '')
      expect(result).toEqual(favorites)
    })

    it('should filter favorites by search query (case-insensitive)', () => {
      const result = filterFavoritesBySearch(favorites, 'alice')
      expect(result.map((f) => f.label)).toEqual(['alice.eth', 'ALICE-2.eth'])
    })

    it('should filter favorites by partial match', () => {
      const result = filterFavoritesBySearch(favorites, 'ob')
      expect(result.map((f) => f.label)).toEqual(['bob.eth'])
    })

    it('should return empty array when no matches found', () => {
      const result = filterFavoritesBySearch(favorites, 'xyz')
      expect(result).toHaveLength(0)
    })

    it('should handle empty favorites array', () => {
      const result = filterFavoritesBySearch([], 'alice')
      expect(result).toHaveLength(0)
    })
  })

  describe('sortFavorites', () => {
    const favorites: readonly FavoriteEntry[] = [
      createFavorite('charlie.eth', 3000),
      createFavorite('alice.eth', 1000),
      createFavorite('bob.eth', 2000),
    ]

    describe('sort by name', () => {
      it('should sort by name ascending', () => {
        const result = sortFavorites(favorites, 'name', 'asc')
        expect(result.map((f) => f.label)).toEqual([
          'alice.eth',
          'bob.eth',
          'charlie.eth',
        ])
      })

      it('should sort by name descending', () => {
        const result = sortFavorites(favorites, 'name', 'desc')
        expect(result.map((f) => f.label)).toEqual([
          'charlie.eth',
          'bob.eth',
          'alice.eth',
        ])
      })
    })

    describe('sort by addedAt', () => {
      it('should sort by addedAt ascending', () => {
        const result = sortFavorites(favorites, 'addedAt', 'asc')
        expect(result.map((f) => f.label)).toEqual([
          'alice.eth',
          'bob.eth',
          'charlie.eth',
        ])
      })

      it('should sort by addedAt descending', () => {
        const result = sortFavorites(favorites, 'addedAt', 'desc')
        expect(result.map((f) => f.label)).toEqual([
          'charlie.eth',
          'bob.eth',
          'alice.eth',
        ])
      })
    })

    it('should not mutate original array', () => {
      const original = [...favorites]
      sortFavorites(favorites, 'name', 'asc')
      expect(favorites).toEqual(original)
    })

    it('should handle empty array', () => {
      const result = sortFavorites([], 'name', 'asc')
      expect(result).toEqual([])
    })

    it('should handle single item array', () => {
      const single = [createFavorite('only.eth', 1000)]
      const result = sortFavorites(single, 'name', 'asc')
      expect(result).toEqual(single)
    })
  })

  describe('paginateFavorites', () => {
    const favorites: readonly FavoriteEntry[] = [
      createFavorite('a.eth', 1000),
      createFavorite('b.eth', 2000),
      createFavorite('c.eth', 3000),
      createFavorite('d.eth', 4000),
      createFavorite('e.eth', 5000),
    ]

    it('should return first page correctly', () => {
      const result = paginateFavorites(favorites, 1, 2)
      expect(result.favorites.map((f) => f.label)).toEqual(['a.eth', 'b.eth'])
      expect(result.totalCount).toBe(5)
      expect(result.totalPages).toBe(3)
      expect(result.hasNextPage).toBe(true)
      expect(result.hasPrevPage).toBe(false)
      expect(result.startIndex).toBe(1)
      expect(result.endIndex).toBe(2)
    })

    it('should return middle page correctly', () => {
      const result = paginateFavorites(favorites, 2, 2)
      expect(result.favorites.map((f) => f.label)).toEqual(['c.eth', 'd.eth'])
      expect(result.hasNextPage).toBe(true)
      expect(result.hasPrevPage).toBe(true)
      expect(result.startIndex).toBe(3)
      expect(result.endIndex).toBe(4)
    })

    it('should return last page correctly with partial results', () => {
      const result = paginateFavorites(favorites, 3, 2)
      expect(result.favorites.map((f) => f.label)).toEqual(['e.eth'])
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPrevPage).toBe(true)
      expect(result.startIndex).toBe(5)
      expect(result.endIndex).toBe(5)
    })

    it('should handle page size larger than total items', () => {
      const result = paginateFavorites(favorites, 1, 10)
      expect(result.favorites).toHaveLength(5)
      expect(result.totalPages).toBe(1)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPrevPage).toBe(false)
      expect(result.startIndex).toBe(1)
      expect(result.endIndex).toBe(5)
    })

    it('should handle empty array', () => {
      const result = paginateFavorites([], 1, 10)
      expect(result.favorites).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(result.totalPages).toBe(0)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPrevPage).toBe(false)
      expect(result.startIndex).toBe(1)
      expect(result.endIndex).toBe(0)
    })

    it('should return empty array for out of bounds page', () => {
      const result = paginateFavorites(favorites, 10, 2)
      expect(result.favorites).toHaveLength(0)
      expect(result.totalCount).toBe(5)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPrevPage).toBe(true)
    })

    it('should handle exact page boundary', () => {
      const result = paginateFavorites(favorites, 1, 5)
      expect(result.favorites).toHaveLength(5)
      expect(result.totalPages).toBe(1)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPrevPage).toBe(false)
    })
  })
})

describe('filterFavoritesByVersion', () => {
  const favorites = [
    createFavorite('old.eth', 1),
    createFavorite('new.eth', 2),
    createFavorite('unknown.eth', 3),
  ]
  const versions = new Map([
    ['old.eth', 'v1' as const],
    ['new.eth', 'v2' as const],
  ])

  it.each([
    ['v1' as const, ['old.eth']],
    ['v2' as const, ['new.eth']],
    [null, ['old.eth', 'new.eth', 'unknown.eth']],
  ])(
    'filters %s without assigning unknown names a version',
    (version, expected) => {
      expect(
        filterFavoritesByVersion(favorites, version, versions).map(
          ({ label }) => label,
        ),
      ).toEqual(expected)
    },
  )
})

it('enriches indexed favorites without treating misses or unknown expiry as non-expiring', () => {
  const record = (name: string, overrides: Partial<LookupRecord> = {}) => ({
    name,
    display_name: name,
    namespace: 'ens',
    namehash: '0x01' as const,
    authority: 'ens_v2' as const,
    read_status: 'ok' as const,
    ...overrides,
  })
  const results = [
    {
      input: { name: 'old.eth' },
      kind: 'name' as const,
      status: 'ok' as const,
      record: record('old.eth', {
        authority: 'ens_v1',
        expires_at: '2027-03-04T00:00:00Z',
        ens_v1: { expires_at: '2027-01-01T00:00:00Z' },
      }),
    },
    {
      input: { name: 'never.eth' },
      kind: 'name' as const,
      status: 'ok' as const,
      record: record('never.eth', {
        expires_at: null,
        expires_at_reason: 'no_expiry',
      }),
    },
    {
      input: { name: 'unknown.eth' },
      kind: 'name' as const,
      status: 'ok' as const,
      record: record('unknown.eth'),
    },
    {
      input: { name: 'missing.eth' },
      kind: 'name' as const,
      status: 'not_found' as const,
    },
  ]
  const metadata = getFavoriteMetadata(
    results,
    new Date('2026-11-03T00:00:00Z'),
  )
  expect(metadata.get('old.eth')).toEqual({
    protocol: 'v1',
    expiryDate: new Date('2027-01-01T00:00:00Z'),
    expiryLabel: 'January 1, 2027',
    isInGrace: false,
  })
  expect(metadata.get('never.eth')?.expiryLabel).toBe('Does not expire')
  expect(metadata.get('unknown.eth')?.expiryLabel).toBeNull()
  expect(metadata.has('missing.eth')).toBe(false)
})

it('offers renewal only for supported names with confirmed eligibility', () => {
  const now = new Date('2026-11-04T00:00:00Z')
  const expiry = new Date('2030-01-01T00:00:00Z')
  expect([
    canRenewFavorite('alice.com', 'v1', expiry, true, now),
    canRenewFavorite('sub.alice.eth', 'v2', expiry, true, now),
    canRenewFavorite('alice.eth', 'v1', expiry, false, now),
    canRenewFavorite('alice.eth', 'v1', expiry, true, now),
    canRenewFavorite('alice.eth', 'v2', new Date('2020-01-01'), false, now),
    canRenewFavorite('alice.eth', 'v2', expiry, false, now),
  ]).toEqual([false, false, false, true, false, true])
})
