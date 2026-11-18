import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockTimeZone } from '@/test-utils/mockTimeZone'
import {
  byShownExpiry,
  getFirstToExpire,
  getNamesAbove,
  getResolvingExpiry,
  isShownExpiryInRange,
} from './addressNames'

describe('getNamesAbove', () => {
  it('lists the parent and every name above it, nearest first', () => {
    expect(getNamesAbove('x.admin.chakri.eth')).toEqual([
      'x.admin.chakri.eth',
      'admin.chakri.eth',
      'chakri.eth',
    ])
  })
})

describe('getFirstToExpire', () => {
  const at = (year: number) => new Date(Date.UTC(year, 0, 1))
  const expiryOf = new Map<string, Date | null>([
    ['ops.team.parent.eth', null],
    ['team.parent.eth', at(2028)],
    ['parent.eth', at(2029)],
  ])

  it('gives the name above that expires first, passing names that never expire', () => {
    expect(
      getFirstToExpire(
        ['ops.team.parent.eth', 'team.parent.eth', 'parent.eth'],
        expiryOf,
      ),
    ).toEqual({ name: 'team.parent.eth', date: at(2028) })
  })

  it('gives none when a name above couldn’t be read', () => {
    expect(
      getFirstToExpire(['unread.parent.eth', 'parent.eth'], expiryOf),
    ).toBeNull()
  })
})

describe('getResolvingExpiry', () => {
  const OWN = new Date(Date.UTC(2031, 0, 1))
  const PARENT = new Date(Date.UTC(2030, 5, 1))
  const NAME = 'parent.eth'

  it.each([
    [
      'its own, with no names above',
      { expiryDate: OWN },
      { type: 'own', date: OWN },
    ],
    [
      'its own, when it comes before the parent’s',
      { expiryDate: PARENT, parentExpiryDate: OWN, parentExpiryName: NAME },
      { type: 'own', date: PARENT },
    ],
    [
      'its own, on the same day as the parent’s',
      { expiryDate: PARENT, parentExpiryDate: PARENT, parentExpiryName: NAME },
      { type: 'own', date: PARENT },
    ],
    [
      'the parent’s, named, when it comes first',
      { expiryDate: OWN, parentExpiryDate: PARENT, parentExpiryName: NAME },
      { type: 'parent', date: PARENT, name: NAME },
    ],
    [
      'the parent’s, named, for a subname with none of its own',
      { expiryDate: null, parentExpiryDate: PARENT, parentExpiryName: NAME },
      { type: 'parent', date: PARENT, name: NAME },
    ],
    [
      'unread, when the parent’s couldn’t be read',
      { expiryDate: null, parentExpiryDate: null },
      { type: 'unread', date: null },
    ],
    [
      'none, for a name that never expires',
      { expiryDate: null },
      { type: 'none', date: null },
    ],
  ])('gives %s', (_, row, expected) => {
    expect(getResolvingExpiry(row)).toEqual(expected)
  })
})

describe('isShownExpiryInRange', () => {
  const range = {
    from: new Date(Date.UTC(2030, 0, 1)),
    to: new Date(Date.UTC(2030, 11, 31)),
  }

  it("matches a subname by its parent's expiry", () => {
    expect(
      isShownExpiryInRange(
        { expiryDate: null, parentExpiryDate: new Date(Date.UTC(2030, 5, 1)) },
        range,
      ),
    ).toBe(true)
  })

  it("uses the parent's expiry when it comes first, and drops a row with none", () => {
    expect(
      isShownExpiryInRange(
        {
          expiryDate: new Date(Date.UTC(2031, 0, 1)),
          parentExpiryDate: new Date(Date.UTC(2030, 5, 1)),
        },
        range,
      ),
    ).toBe(true)
    expect(isShownExpiryInRange({ expiryDate: null }, range)).toBe(false)
  })
})

describe('isShownExpiryInRange, seen from UTC−8', () => {
  beforeEach(() => {
    mockTimeZone('America/Los_Angeles')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The picker gives local midnight, 08:00 UTC; the row shows the expiry's UTC day.
  const JAN_1_LOCAL = new Date(Date.UTC(2030, 0, 1, 8))

  it.each([
    ['from', { from: JAN_1_LOCAL }, new Date(Date.UTC(2030, 0, 1, 2))],
    ['to', { to: JAN_1_LOCAL }, new Date(Date.UTC(2030, 0, 1, 20))],
  ])(
    'keeps a row shown on the picked day when it is the %s date',
    (_, range, expiryDate) => {
      expect(isShownExpiryInRange({ expiryDate }, range)).toBe(true)
    },
  )
})

describe('byShownExpiry', () => {
  it("sorts by the shown expiry, the parent's for a subname, with none last", () => {
    const rows = [
      { name: 'never', expiryDate: null },
      { name: 'later', expiryDate: new Date(Date.UTC(2031, 0, 1)) },
      {
        name: 'subname',
        expiryDate: null,
        parentExpiryDate: new Date(Date.UTC(2030, 0, 1)),
      },
    ]

    expect(rows.toSorted(byShownExpiry).map(({ name }) => name)).toEqual([
      'subname',
      'later',
      'never',
    ])
  })
})
