import { maxUint64 } from 'viem'
import { describe, expect, it } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import {
  DEFAULT_SUBNAME_EXPIRY,
  getFirstToExpire,
  getSubnameExpirySeconds,
  isPastParentExpiry,
  type SubnameExpiry,
} from './subnameExpiry'

describe('getFirstToExpire', () => {
  it('gives the name above that expires first, passing names that never expire', () => {
    expect(
      getFirstToExpire([
        { name: 'x.admin.chakri.eth', expiry: null },
        { name: 'admin.chakri.eth', expiry: 1_900_000_000 },
        { name: 'chakri.eth', expiry: 2_000_000_000 },
      ]),
    ).toEqual({ name: 'admin.chakri.eth', expirySeconds: 1_900_000_000n })
  })

  it('gives none when no name above expires', () => {
    expect(getFirstToExpire([{ name: 'right.chakri.eth', expiry: null }])).toBe(
      null,
    )
  })
})

const NOW = 1_800_000_000n
const CLOCK = {
  today: Temporal.PlainDate.from('2027-01-15'),
  nowSeconds: NOW,
}
const inDays = (days: number): SubnameExpiry => ({
  type: 'span',
  span: { type: 'date', date: CLOCK.today.add({ days }) },
})
const PARENT_EXPIRY = NOW + BigInt(30 * SECONDS_PER_DAY)

describe('getSubnameExpirySeconds', () => {
  it('gives a new subname no expiry of its own unless one is picked', () => {
    expect(getSubnameExpirySeconds(DEFAULT_SUBNAME_EXPIRY, CLOCK)).toBe(
      maxUint64,
    )
  })

  it('counts a picked date from now, so it is never already past', () => {
    expect(getSubnameExpirySeconds(inDays(10), CLOCK)).toBe(
      NOW + BigInt(10 * SECONDS_PER_DAY),
    )
  })

  it.each<SubnameExpiry>([
    {
      type: 'span',
      span: { type: 'date', date: Temporal.PlainDate.from('2028-01-15') },
    },
    { type: 'span', span: { type: 'years', years: 1 } },
  ])(
    'keeps a year out on its calendar day, late in the day too (%o)',
    (expiry) => {
      const lateInTheDay = NOW + 12n * 3600n
      expect(
        getSubnameExpirySeconds(expiry, { ...CLOCK, nowSeconds: lateInTheDay }),
      ).toBe(lateInTheDay + BigInt(365 * SECONDS_PER_DAY))
    },
  )

  it('still lands a day out once the picked date is no longer ahead', () => {
    expect(getSubnameExpirySeconds(inDays(0), CLOCK)).toBe(
      NOW + BigInt(SECONDS_PER_DAY),
    )
  })
})

describe('isPastParentExpiry', () => {
  it.each([
    ['flags a date past the parent’s', inDays(31), true],
    ['passes a date before the parent’s', inDays(29), false],
    [
      'passes no expiry, which lapses with the parent',
      DEFAULT_SUBNAME_EXPIRY,
      false,
    ],
  ])('%s', (_, expiry, expected) => {
    expect(isPastParentExpiry(expiry, CLOCK, PARENT_EXPIRY)).toBe(expected)
  })
})
