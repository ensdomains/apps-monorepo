import { maxUint64 } from 'viem'
import { describe, expect, it } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import {
  canExtendExpiry,
  DEFAULT_SUBNAME_EXPIRY,
  getExtendedExpirySeconds,
  getSubnameExpirySeconds,
  type SubnameExpiry,
} from './subnameExpiry'

const NOW = 1_800_000_000n
const CLOCK = {
  today: Temporal.PlainDate.from('2027-01-15'),
  nowSeconds: NOW,
}
const inDays = (days: number): SubnameExpiry => ({
  type: 'span',
  span: { type: 'date', date: CLOCK.today.add({ days }) },
})

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

describe('canExtendExpiry', () => {
  const NOW_MS = Date.UTC(2027, 0, 15)

  it.each([
    ['one with no expiry of its own', null, false],
    ['an ENSv1 row, which carries none', undefined, false],
    ['one that has lapsed', new Date(NOW_MS - 1), false],
    ['one that hasn’t lapsed', new Date(NOW_MS + 1), true],
  ])('extends %s: %s', (_, expiryDate, expected) => {
    expect(canExtendExpiry(expiryDate, NOW_MS)).toBe(expected)
  })
})

describe('getExtendedExpirySeconds', () => {
  it('counts the picked span in calendar days from the current expiry, leap day included', () => {
    // Midday UTC keeps the calendar day the same in every viewer's zone.
    const expiry = new Date(Date.UTC(2027, 9, 13, 12))
    const expirySeconds = BigInt(expiry.getTime() / 1000)

    expect(getExtendedExpirySeconds(expiry, { type: 'years', years: 1 })).toBe(
      expirySeconds + BigInt(366 * SECONDS_PER_DAY),
    )
  })
})
