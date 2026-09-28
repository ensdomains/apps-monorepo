import { secondsInDay } from 'date-fns/constants'
import { describe, expect, it } from 'vitest'
import {
  getDurationInSecondsFromYears,
  MAX_DURATION_YEARS,
} from '@/features/register-v2/utils/time'
import {
  getBulkRenewDurationPrefill,
  getRequestedTargetDateSelection,
} from './durationPrefill'
import { durationForName, newExpiryDateForName } from './pricing'

describe('bulk renewal duration prefill', () => {
  it('retains a below-minimum requested date for the error review without a default duration', () => {
    const date = '2030-12-20'
    const result = getBulkRenewDurationPrefill(
      { initialTargetDate: date },
      [
        {
          name: 'juniper.eth',
          currentExpiry: BigInt(new Date(2030, 11, 15).getTime() / 1000),
        },
      ],
      new Date(2030, 0, 1),
    )
    expect(result.status).toBe('invalid')
    const requested = getRequestedTargetDateSelection(date)
    expect(requested).toEqual({
      kind: 'custom',
      targetMs: new Date(2030, 11, 20, 23, 59, 59).getTime(),
      exactTarget: true,
    })
    expect(getRequestedTargetDateSelection('2030-02-30')).toBeNull()
    expect(getRequestedTargetDateSelection(undefined)).toBeNull()
  })

  it('keeps the native one-year default when no duration was requested', () => {
    expect(getBulkRenewDurationPrefill({})).toEqual({
      status: 'ready',
      selection: { kind: 'preset', years: 1 },
    })
  })

  it.each([
    28, 45, 69, 730,
  ])('preserves exactly %s added days for names with different expiries', (days) => {
    const result = getBulkRenewDurationPrefill({ initialDurationDays: days })
    expect(result).toEqual({
      status: 'ready',
      selection: { kind: 'days', days },
    })
    if (result.status !== 'ready') throw new Error('Expected valid prefill')
    for (const timestamp of [
      '2028-02-28T12:34:56Z',
      '2028-03-11T23:59:59Z',
      '2028-10-31T02:03:04Z',
    ]) {
      const expiry = BigInt(Date.parse(timestamp) / 1000)
      expect(durationForName(result.selection, expiry)).toBe(
        BigInt(days * secondsInDay),
      )
      expect(newExpiryDateForName(result.selection, expiry).getTime()).toBe(
        Number(expiry) * 1000 + days * secondsInDay * 1000,
      )
    }
  })

  it.each([
    1,
    2,
    7,
    MAX_DURATION_YEARS,
  ])('retains %s calendar years per name instead of converting to 365-day years', (years) => {
    const result = getBulkRenewDurationPrefill({ initialDurationYears: years })
    expect(result).toEqual({
      status: 'ready',
      selection: { kind: 'preset', years },
    })
    if (result.status !== 'ready') throw new Error('Expected valid prefill')
    const expiryDate = new Date('2027-08-15T12:34:56Z')
    expect(
      durationForName(result.selection, BigInt(expiryDate.getTime() / 1000)),
    ).toBe(BigInt(getDurationInSecondsFromYears(years, expiryDate)))
  })

  it.each([
    0,
    1,
    10,
    27,
    -28,
    28.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    40_000_000,
  ])('rejects invalid or below-minimum day prefill %s without silently rounding', (initialDurationDays) => {
    expect(getBulkRenewDurationPrefill({ initialDurationDays }).status).toBe(
      'invalid',
    )
  })

  it.each([
    0,
    -1,
    1.5,
    MAX_DURATION_YEARS + 1,
    Number.NaN,
  ])('rejects invalid year prefill %s', (initialDurationYears) => {
    expect(getBulkRenewDurationPrefill({ initialDurationYears }).status).toBe(
      'invalid',
    )
  })

  it('rejects conflicting day and year inputs', () => {
    expect(
      getBulkRenewDurationPrefill({
        initialDurationDays: 69,
        initialDurationYears: 1,
      }).status,
    ).toBe('invalid')
  })
})
