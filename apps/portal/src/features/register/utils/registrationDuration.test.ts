import { addMonths, addYears } from 'date-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  calculateDurationFromDate,
  formatRegistrationDuration,
  getDurationInSeconds,
  getDurationInSecondsFromYears,
  getExpiryDateFromSeconds,
} from './registrationDuration'

describe('registrationDuration', () => {
  const FIXED_TODAY = new Date('2025-01-15T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_TODAY)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatRegistrationDuration', () => {
    it('should return "1 year" when expiry is today or in the past', () => {
      expect(formatRegistrationDuration(new Date('2025-01-15T00:00:00Z'))).toBe(
        '1 year',
      )
      expect(formatRegistrationDuration(new Date('2024-06-01'))).toBe('1 year')
    })

    it('should return "1 year" for exactly one year from today', () => {
      const oneYearFromNow = addYears(FIXED_TODAY, 1)
      expect(formatRegistrationDuration(oneYearFromNow)).toBe('1 year')
    })

    it('should return "2 years" for two years from today', () => {
      const twoYearsFromNow = addYears(FIXED_TODAY, 2)
      expect(formatRegistrationDuration(twoYearsFromNow)).toBe('2 years')
    })

    it('should return "1 year 3 months" for 1 year 3 months from today', () => {
      const target = addYears(addMonths(FIXED_TODAY, 3), 1)
      expect(formatRegistrationDuration(target)).toBe('1 year 3 months')
    })

    it('should return "2 years 6 months" for 2 years 6 months from today', () => {
      const target = addYears(addMonths(FIXED_TODAY, 6), 2)
      expect(formatRegistrationDuration(target)).toBe('2 years 6 months')
    })

    it('should return "1 month" for one month from today', () => {
      const target = addMonths(FIXED_TODAY, 1)
      expect(formatRegistrationDuration(target)).toBe('1 month')
    })

    it('should return "6 months" for six months from today', () => {
      const target = addMonths(FIXED_TODAY, 6)
      expect(formatRegistrationDuration(target)).toBe('6 months')
    })

    it('should return "1 day" for one day from today', () => {
      const target = new Date(FIXED_TODAY)
      target.setDate(target.getDate() + 1)
      expect(formatRegistrationDuration(target)).toBe('1 day')
    })

    it('should return "15 days" for 15 days from today (no months)', () => {
      const target = new Date(FIXED_TODAY)
      target.setDate(target.getDate() + 15)
      expect(formatRegistrationDuration(target)).toBe('15 days')
    })

    it('should not include days when months are present', () => {
      const target = addMonths(FIXED_TODAY, 1)
      target.setDate(target.getDate() + 5)
      expect(formatRegistrationDuration(target)).toBe('1 month')
    })
  })

  describe('calculateDurationFromDate', () => {
    it('should return 1 when target is today or in the past', () => {
      expect(calculateDurationFromDate(new Date('2025-01-15T00:00:00Z'))).toBe(
        1,
      )
      expect(calculateDurationFromDate(new Date('2024-01-01'))).toBe(1)
    })

    it('should return ~1 for exactly one year from today', () => {
      const oneYearFromNow = addYears(FIXED_TODAY, 1)
      const result = calculateDurationFromDate(oneYearFromNow)
      expect(result).toBeGreaterThan(0.99)
      expect(result).toBeLessThan(1.01)
    })

    it('should return ~2 for two years from today', () => {
      const twoYearsFromNow = addYears(FIXED_TODAY, 2)
      const result = calculateDurationFromDate(twoYearsFromNow)
      expect(result).toBeGreaterThan(1.99)
      expect(result).toBeLessThan(2.01)
    })

    it('should preserve fractional years (no rounding)', () => {
      const sixMonthsFromNow = addMonths(FIXED_TODAY, 6)
      const result = calculateDurationFromDate(sixMonthsFromNow)
      expect(result).toBeGreaterThan(0.49)
      expect(result).toBeLessThan(0.51)
    })

    it('should preserve fractional years for 1 year and 1 day', () => {
      const justOverOneYear = addYears(FIXED_TODAY, 1)
      justOverOneYear.setDate(justOverOneYear.getDate() + 1)
      const result = calculateDurationFromDate(justOverOneYear)
      expect(result).toBeGreaterThan(1)
      expect(result).toBeLessThan(1.01)
    })

    it('should return at least 1', () => {
      const farPast = new Date('2020-01-01')
      expect(calculateDurationFromDate(farPast)).toBe(1)
    })
  })

  describe('getDurationInSeconds', () => {
    it('should return ~31557600 for 1 year', () => {
      const oneYearFromNow = addYears(FIXED_TODAY, 1)
      expect(getDurationInSeconds(oneYearFromNow)).toBe(SECONDS_PER_YEAR)
    })

    it('should return ~63115200 for 2 years', () => {
      const twoYearsFromNow = addYears(FIXED_TODAY, 2)
      const result = getDurationInSeconds(twoYearsFromNow)
      expect(result).toBeGreaterThanOrEqual(63_000_000)
      expect(result).toBeLessThanOrEqual(63_200_000)
    })

    it('should return at least 1 year in seconds for past dates', () => {
      expect(getDurationInSeconds(new Date('2024-01-01'))).toBe(
        SECONDS_PER_YEAR,
      )
    })
  })

  describe('getDurationInSecondsFromYears', () => {
    it('should return ~31557600 for 1 year', () => {
      expect(getDurationInSecondsFromYears(1)).toBe(SECONDS_PER_YEAR)
    })

    it('should return ~63115200 for 2 years', () => {
      expect(getDurationInSecondsFromYears(2)).toBe(2 * SECONDS_PER_YEAR)
    })

    it('should return at least 1 year in seconds for values less than 1', () => {
      expect(getDurationInSecondsFromYears(0.5)).toBe(SECONDS_PER_YEAR)
    })
  })

  describe('getExpiryDateFromSeconds', () => {
    it('should return date ~1 year from now for SECONDS_PER_YEAR', () => {
      const result = getExpiryDateFromSeconds(SECONDS_PER_YEAR)
      const expectedMs = FIXED_TODAY.getTime() + SECONDS_PER_YEAR * 1000
      expect(result.getTime()).toBe(expectedMs)
    })

    it('should round-trip with getDurationInSeconds', () => {
      const date = addYears(FIXED_TODAY, 2)
      const seconds = getDurationInSeconds(date)
      const backToDate = getExpiryDateFromSeconds(seconds)
      expect(backToDate.getTime()).toBe(FIXED_TODAY.getTime() + seconds * 1000)
    })
  })
})
