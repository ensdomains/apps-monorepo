import { maxUint64 } from 'viem'
import { describe, expect, it } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import {
  DEFAULT_SUBNAME_EXPIRY,
  getSubnameExpirySeconds,
  isPastParentExpiry,
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
