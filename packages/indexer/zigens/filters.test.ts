import { describe, expect, it } from 'vitest'
import {
  isChildOf,
  type Sorted,
  toSortedComparator,
  toV1SortKey,
  toV1Variables,
  toV2SortKey,
  toV2Terms,
  toV2Variables,
} from './filters'

const ADDRESS = '0xDA53c38ffacb571f904587e46a8ebf3f5f45e945'
const LOWER = ADDRESS.toLowerCase()
const V1_CONTEXT = {
  now: new Date('2026-11-17T00:00:00Z'),
  nameWrapper: '0x0635513F179D50A207757E05759CbD106d7dFcE8',
}
const WRAPPED = {
  and: [
    { wrappedOwner: LOWER },
    { owner: '0x0635513f179d50a207757e05759cbd106d7dfce8' },
  ],
}

describe('toV2Terms', () => {
  it.each([
    {
      case: 'every relation',
      relations: undefined,
      or: [{ owner: LOWER }, { name_in: ['a.eth'] }],
    },
    {
      case: 'a manager, as the owner',
      relations: ['manager'] as const,
      or: [{ owner: LOWER }],
    },
    {
      case: 'a role holder',
      relations: ['role_holder'] as const,
      or: [{ name_in: ['a.eth'] }],
    },
  ])('matches $case', ({ relations, or }) => {
    expect(toV2Terms({ address: ADDRESS, relations }, ['a.eth'])).toEqual(or)
  })

  it('matches nothing for a role holder with no roles', () => {
    expect(
      toV2Terms({ address: ADDRESS, relations: ['role_holder'] }, []),
    ).toEqual([])
  })

  it('names at most 32 role names a term, the most a zigens filter takes', () => {
    const names = Array.from({ length: 65 }, (_, index) => `n${index}.eth`)

    expect(
      toV2Terms({ address: ADDRESS, relations: ['role_holder'] }, names).map(
        (term) => (Array.isArray(term.name_in) ? term.name_in.length : 0),
      ),
    ).toEqual([32, 32, 1])
  })
})

describe('toV2Variables', () => {
  it('sends the text, migration and parent filters in zigens terms', () => {
    expect(
      toV2Variables(
        {
          address: ADDRESS,
          contains: 'ali',
          prefix: 'ignored',
          migratedOnly: true,
          parent: 'eth',
          sort: 'expiry',
          order: 'desc',
        },
        [{ owner: LOWER }],
        'cursor',
        25,
      ),
    ).toEqual({
      where: {
        or: [{ owner: LOWER }],
        name_contains: 'ali',
        isMigrated: true,
        name_ends_with: '.eth',
      },
      first: 25,
      after: 'cursor',
      orderBy: 'expiryDate',
      orderDirection: 'desc',
    })
  })
})

describe('toV1Variables', () => {
  it.each([
    {
      case: 'an owner through any token',
      relations: ['owner'] as const,
      or: [{ registrant: LOWER }, WRAPPED, { owner: LOWER }],
    },
    {
      case: 'a manager through the registry or the wrapper',
      relations: ['manager'] as const,
      or: [WRAPPED, { owner: LOWER }],
    },
  ])('matches $case', ({ relations, or }) => {
    expect(
      toV1Variables({ address: ADDRESS, relations }, 0, 50, V1_CONTEXT)?.where
        .and[0],
    ).toEqual({ or })
  })

  it('reads only names still held, the subgraph expiry of a 2LD counting its grace', () => {
    expect(
      toV1Variables({ address: ADDRESS }, 0, 50, V1_CONTEXT)?.where.and[1],
    ).toEqual({ or: [{ expiryDate_gt: '1794873600' }, { expiryDate: null }] })
  })

  it('reads every name an address resolves to, held or not', () => {
    expect(
      toV1Variables({ address: ADDRESS, resolvesTo: true }, 0, 50, V1_CONTEXT)
        ?.where.and,
    ).toEqual([{ or: [{ resolvedAddress: LOWER }] }])
  })

  it.each([
    { case: 'migrated names', query: { migratedOnly: true } },
    { case: 'role holders', query: { relations: ['role_holder'] as const } },
  ])('has no ENSv1 names for $case', ({ query }) => {
    expect(
      toV1Variables({ address: ADDRESS, ...query }, 0, 50, V1_CONTEXT),
    ).toBeNull()
  })

  it('reads direct children by the parent node', () => {
    expect(
      toV1Variables({ address: ADDRESS, parent: 'eth' }, 0, 50, V1_CONTEXT)
        ?.where.parent,
    ).toBe('0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae')
  })
})

describe('isChildOf', () => {
  it.each([
    ['a.eth', 'eth', true],
    ['a.b.eth', 'eth', false],
    ['eth', 'eth', false],
  ])('%s under %s is %s', (name, parent, expected) => {
    expect(isChildOf(name, parent)).toBe(expected)
  })
})

describe('merge order', () => {
  // A re-registered ENSv1 name: created long ago, so the subgraph sorts it by its creation.
  const v1 = {
    name: 'old.eth',
    expiryDate: null,
    createdAt: '1500000000',
  } as const
  const v2 = {
    name: 'new.eth',
    expiryDate: 1826469384,
    registrationDate: 1600000000,
    createdAt: 1600000000,
  } as const

  it('compares each row by the field its own source sorted on', () => {
    const query = { address: ADDRESS, sort: 'registered' } as const

    expect(toV1SortKey(v1, query)).toBe(1500000000)
    expect(toV2SortKey(v2, query)).toBe(1600000000)
  })

  it('puts rows with no value last when ascending and first when descending', () => {
    const rows: readonly Sorted<string>[] = [
      { item: 'none', key: null },
      { item: 'b', key: 2 },
      { item: 'a', key: 1 },
    ]
    const order = (sortOrder: 'asc' | 'desc') =>
      [...rows]
        .sort(toSortedComparator({ address: ADDRESS, order: sortOrder }))
        .map(({ item }) => item)

    expect(order('asc')).toEqual(['a', 'b', 'none'])
    expect(order('desc')).toEqual(['none', 'b', 'a'])
  })
})
