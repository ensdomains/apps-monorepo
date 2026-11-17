import { describe, expect, it } from 'vitest'
import type { NameSummary } from '../reads/namesForAddress.types'
import {
  isChildOf,
  toSummaryComparator,
  toV1Variables,
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

describe('toSummaryComparator', () => {
  const summary = (name: string, expiresAt: Date | null) =>
    ({ name, expiresAt }) as NameSummary

  it('orders by expiry with names that never expire last', () => {
    const rows = [
      summary('c', null),
      summary('b', new Date(2)),
      summary('a', new Date(1)),
    ]

    expect(
      [...rows]
        .sort(toSummaryComparator({ address: ADDRESS, sort: 'expiry' }))
        .map(({ name }) => name),
    ).toEqual(['a', 'b', 'c'])
  })
})
