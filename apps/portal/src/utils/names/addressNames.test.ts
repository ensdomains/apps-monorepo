import { describe, expect, it } from 'vitest'
import {
  byShownExpiry,
  getEarlierParentExpiry,
  getEarliestExpiry,
  isShownExpiryInRange,
} from './addressNames'

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
