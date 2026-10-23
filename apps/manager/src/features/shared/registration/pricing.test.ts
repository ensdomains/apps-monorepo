import { describe, expect, it } from 'vitest'
import {
  durationYearsToSeconds,
  MIN_REGISTER_DURATION_SECONDS,
  MIN_REGISTER_DURATION_YEARS,
  SECONDS_PER_DAY,
  SECONDS_PER_YEAR,
} from './pricing'

describe('durationYearsToSeconds', () => {
  it('converts 1 year to seconds', () => {
    expect(durationYearsToSeconds(1)).toBe(BigInt(SECONDS_PER_YEAR))
  })

  it('converts fractional years', () => {
    const result = durationYearsToSeconds(0.5)
    const expected = BigInt(Math.round(0.5 * SECONDS_PER_YEAR))
    expect(result).toBe(expected)
  })

  it('returns minimum for zero, negative, and non-finite values', () => {
    const min = BigInt(MIN_REGISTER_DURATION_SECONDS)
    expect(durationYearsToSeconds(0)).toBe(min)
    expect(durationYearsToSeconds(-1)).toBe(min)
    expect(durationYearsToSeconds(Number.NaN)).toBe(min)
    expect(durationYearsToSeconds(Number.POSITIVE_INFINITY)).toBe(min)
  })

  it('clamps very small durations to minimum seconds', () => {
    expect(durationYearsToSeconds(0.001)).toBe(
      BigInt(MIN_REGISTER_DURATION_SECONDS),
    )
  })

  it('handles large durations', () => {
    const result = durationYearsToSeconds(100)
    expect(result).toBe(BigInt(100 * SECONDS_PER_YEAR))
  })
})

describe('constants', () => {
  it('SECONDS_PER_DAY is 86400', () => {
    expect(SECONDS_PER_DAY).toBe(86400)
  })

  it('SECONDS_PER_YEAR is 365 days', () => {
    expect(SECONDS_PER_YEAR).toBe(365 * 86400)
  })

  it('MIN_REGISTER_DURATION_SECONDS is 28 days', () => {
    expect(MIN_REGISTER_DURATION_SECONDS).toBe(28 * 86400)
  })

  it('MIN_REGISTER_DURATION_YEARS is consistent', () => {
    expect(MIN_REGISTER_DURATION_YEARS).toBeCloseTo(28 / 365, 5)
  })
})
