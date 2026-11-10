import { describe, expect, it } from 'vitest'
import {
  byShownExpiry,
  getEarlierParentExpiry,
  getEarliestExpiry,
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

describe('getEarliestExpiry', () => {
  const at = (year: number) => new Date(Date.UTC(year, 0, 1))
  const expiryOf = new Map<string, Date | null>([
    ['ops.team.parent.eth', null],
    ['team.parent.eth', at(2028)],
    ['parent.eth', at(2029)],
  ])

  it('gives the earliest expiry above, passing names that never expire', () => {
    expect(
      getEarliestExpiry(
        ['ops.team.parent.eth', 'team.parent.eth', 'parent.eth'],
        expiryOf,
      ),
    ).toEqual(at(2028))
  })

  it('gives none when a name above couldn’t be read', () => {
    expect(
      getEarliestExpiry(['unread.parent.eth', 'parent.eth'], expiryOf),
    ).toBeNull()
  })
})

describe('getEarlierParentExpiry', () => {
  const PARENT_EXPIRY = new Date(Date.UTC(2030, 5, 1))

  it.each([
    ['gives the parent’s for an own expiry after it', 2031, PARENT_EXPIRY],
    ['gives none for an own expiry before it', 2029, null],
  ])('%s', (_, ownYear, expected) => {
    expect(
      getEarlierParentExpiry({
        expiryDate: new Date(Date.UTC(ownYear, 0, 1)),
        parentExpiryDate: PARENT_EXPIRY,
      }),
    ).toEqual(expected)
  })

  it('gives none for a subname with no expiry of its own', () => {
    expect(
      getEarlierParentExpiry({
        expiryDate: null,
        parentExpiryDate: PARENT_EXPIRY,
      }),
    ).toBeNull()
  })
})

describe('getResolvingExpiry', () => {
  const OWN = new Date(Date.UTC(2031, 0, 1))
  const PARENT = new Date(Date.UTC(2030, 5, 1))

  it.each([
    [
      'its own, with no names above',
      { expiryDate: OWN },
      { type: 'own', date: OWN },
    ],
    [
      'its own, when it comes before the parent’s',
      { expiryDate: PARENT, parentExpiryDate: OWN },
      { type: 'own', date: PARENT },
    ],
    [
      'the parent’s, when it comes first',
      { expiryDate: OWN, parentExpiryDate: PARENT },
      { type: 'parentFirst', date: PARENT },
    ],
    [
      'the parent’s, for a subname with none of its own',
      { expiryDate: null, parentExpiryDate: PARENT },
      { type: 'parent', date: PARENT },
    ],
    [
      'the parent’s, unknown when it couldn’t be read',
      { expiryDate: null, parentExpiryDate: null },
      { type: 'parent', date: null },
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

  it("prefers the name's own expiry and drops a row with none", () => {
    expect(
      isShownExpiryInRange(
        {
          expiryDate: new Date(Date.UTC(2031, 0, 1)),
          parentExpiryDate: new Date(Date.UTC(2030, 5, 1)),
        },
        range,
      ),
    ).toBe(false)
    expect(isShownExpiryInRange({ expiryDate: null }, range)).toBe(false)
  })
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
