import { describe, expect, it } from 'vitest'
import {
  isChildOf,
  type Sorted,
  toSortedComparator,
  toV1SortKey,
  toV1Variables,
  toV2SortKey,
  toV2Variables,
} from './filters'

const ADDRESS = '0xDA53c38ffacb571f904587e46a8ebf3f5f45e945'
const LOWER = ADDRESS.toLowerCase()

describe('toV2Variables', () => {
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
    expect(
      toV2Variables({ address: ADDRESS, relations }, ['a.eth'], undefined, 50)
        ?.where.or,
    ).toEqual(or)
  })

  it('matches nothing for a role holder with no roles', () => {
    expect(
      toV2Variables(
        { address: ADDRESS, relations: ['role_holder'] },
        [],
        undefined,
        50,
      ),
    ).toBeNull()
  })

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
        [],
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
      or: [{ registrant: LOWER }, { wrappedOwner: LOWER }, { owner: LOWER }],
    },
    {
      case: 'a manager through the registry or the wrapper',
      relations: ['manager'] as const,
      or: [{ wrappedOwner: LOWER }, { owner: LOWER }],
    },
  ])('matches $case', ({ relations, or }) => {
    expect(
      toV1Variables({ address: ADDRESS, relations }, 0, 50)?.where.or,
    ).toEqual(or)
  })

  it.each([
    { case: 'migrated names', query: { migratedOnly: true } },
    { case: 'role holders', query: { relations: ['role_holder'] as const } },
  ])('has no ENSv1 names for $case', ({ query }) => {
    expect(toV1Variables({ address: ADDRESS, ...query }, 0, 50)).toBeNull()
  })

  it('reads direct children by the parent node', () => {
    expect(
      toV1Variables({ address: ADDRESS, parent: 'eth' }, 0, 50)?.where.parent,
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

describe('toV2Variables role names', () => {
  it('matches every role name, in batches the schema accepts', () => {
    const names = Array.from({ length: 2001 }, (_, index) => `n${index}.eth`)

    const or = toV2Variables(
      { address: ADDRESS, relations: ['role_holder'] },
      names,
      undefined,
      50,
    )?.where.or

    expect(
      or?.map((filter) => ('name_in' in filter ? filter.name_in.length : 0)),
    ).toEqual([1000, 1000, 1])
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
