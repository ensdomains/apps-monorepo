import { labelhash, maxUint64 } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'
import { mockTimeZone } from '@/test-utils/mockTimeZone'
import {
  canChangeSubnameExpiration,
  canExtendExpiry,
  DEFAULT_SUBNAME_EXPIRY,
  getChangeExpirationBlockedReason,
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

  describe('seen from a time zone behind UTC', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('counts from the UTC day the dialog shows, not the viewer’s local day', () => {
      mockTimeZone('America/Los_Angeles')
      // October 13 in UTC, still October 12 in Los Angeles.
      const expiry = new Date(Date.UTC(2027, 9, 13, 1))
      const span = {
        type: 'date',
        date: Temporal.PlainDate.from('2027-10-20'),
      } as const

      expect(getExtendedExpirySeconds(expiry, span)).toBe(
        BigInt(expiry.getTime() / 1000) + BigInt(7 * SECONDS_PER_DAY),
      )
    })
  })
})

describe('canChangeSubnameExpiration', () => {
  const NOW_MS = Date.UTC(2027, 0, 15)
  const RESOURCE_ID = resourceIdFromChainValue(
    labelhash('admin'),
  )._unsafeUnwrap()
  const change = (
    overrides: Partial<Parameters<typeof canChangeSubnameExpiration>[0]>,
  ) =>
    canChangeSubnameExpiration({
      resourceId: RESOURCE_ID,
      expiryDate: new Date(NOW_MS + 1),
      nowMs: NOW_MS,
      hasRootRenewRole: false,
      perRowRenewRoles: undefined,
      ...overrides,
    })

  it.each([
    [
      'the account renews across the registry',
      true,
      { hasRootRenewRole: true },
    ],
    [
      'the account renews only that subname',
      true,
      { perRowRenewRoles: new Map([[RESOURCE_ID.toString(), true]]) },
    ],
    [
      'the account renews neither',
      false,
      { perRowRenewRoles: new Map([[RESOURCE_ID.toString(), false]]) },
    ],
    [
      'the registry answer is still loading',
      false,
      { hasRootRenewRole: undefined },
    ],
    [
      'the subname has no resource id',
      false,
      { resourceId: null, hasRootRenewRole: true },
    ],
    [
      'its own expiry has lapsed',
      false,
      { expiryDate: new Date(NOW_MS - 1), hasRootRenewRole: true },
    ],
  ])('when %s: %s', (_, expected, overrides) => {
    expect(change(overrides)).toBe(expected)
  })
})

describe('getChangeExpirationBlockedReason', () => {
  const SOME_DATE = new Date(Date.UTC(2030, 0, 1))

  it.each([
    [
      'points a renewer at the name it lasts as long as',
      { expiryDate: null, canRenew: true, expiresWithName: 'chakri.eth' },
      'This subname has no expiration date of its own. It stays active as long as chakri.eth does. To keep it longer, extend chakri.eth.',
    ],
    [
      'gives none for a subname with an expiry of its own',
      { expiryDate: SOME_DATE, canRenew: true, expiresWithName: 'chakri.eth' },
      undefined,
    ],
    [
      'gives none to an account that couldn’t change it anyway',
      { expiryDate: null, canRenew: false, expiresWithName: 'chakri.eth' },
      undefined,
    ],
    [
      'gives none while the name it lasts as long as is unknown',
      { expiryDate: null, canRenew: true, expiresWithName: undefined },
      undefined,
    ],
  ])('%s', (_, input, expected) => {
    expect(getChangeExpirationBlockedReason(input)).toBe(expected)
  })
})
