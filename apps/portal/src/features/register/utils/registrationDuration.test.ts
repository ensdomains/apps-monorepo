import { addMonths, addYears, endOfDay } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  calculateDurationFromDate,
  formatRegistrationDuration,
  getDurationInSecondsFromYears,
  getRegistrationDurationInSeconds,
  getRegistrationExpiryDateFromSeconds,
} from './registrationDuration'

describe('registrationDuration', () => {
  const FIXED_TODAY = new Date('2025-01-15T12:00:00Z')
  const endOfFixedToday = endOfDay(FIXED_TODAY)

  describe('formatRegistrationDuration', () => {
    it('should return "1 year" when expiry is today or in the past', () => {
      expect(
        formatRegistrationDuration(
          endOfFixedToday,
          new Date('2025-01-15T00:00:00Z'),
        ),
      ).toBe('1 year')
      expect(
        formatRegistrationDuration(endOfFixedToday, new Date('2024-06-01')),
      ).toBe('1 year')
    })

    it('should return "1 year" for exactly one year from today', () => {
      const oneYearFromNow = addYears(endOfFixedToday, 1)
      expect(formatRegistrationDuration(endOfFixedToday, oneYearFromNow)).toBe(
        '1 year',
      )
    })

    it('should return "2 years" for two years from today', () => {
      const twoYearsFromNow = addYears(endOfFixedToday, 2)
      expect(formatRegistrationDuration(endOfFixedToday, twoYearsFromNow)).toBe(
        '2 years',
      )
    })

    it('should return "1 year 3 months" for 1 year 3 months from today', () => {
      const target = addYears(addMonths(endOfFixedToday, 3), 1)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe(
        '1 year 3 months',
      )
    })

    it('should return "2 years 6 months" for 2 years 6 months from today', () => {
      const target = addYears(addMonths(endOfFixedToday, 6), 2)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe(
        '2 years 6 months',
      )
    })

    it('should return "1 month" for one month from today', () => {
      const target = addMonths(endOfFixedToday, 1)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe(
        '1 month',
      )
    })

    it('should return "6 months" for six months from today', () => {
      const target = addMonths(endOfFixedToday, 6)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe(
        '6 months',
      )
    })

    it('should return "1 day" for one day from today', () => {
      const target = new Date(endOfFixedToday)
      target.setDate(target.getDate() + 1)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe('1 day')
    })

    it('should return "15 days" for 15 days from today (no months)', () => {
      const target = new Date(endOfFixedToday)
      target.setDate(target.getDate() + 15)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe(
        '15 days',
      )
    })

    it('should not include days when months are present', () => {
      const target = addMonths(endOfFixedToday, 1)
      target.setDate(target.getDate() + 5)
      expect(formatRegistrationDuration(endOfFixedToday, target)).toBe(
        '1 month',
      )
    })
  })

  describe('calculateDurationFromDate', () => {
    it('should return 1 when target is today or in the past', () => {
      expect(
        calculateDurationFromDate(
          endOfFixedToday,
          new Date('2025-01-15T00:00:00Z'),
        ),
      ).toBe(1)
      expect(
        calculateDurationFromDate(endOfFixedToday, new Date('2024-01-01')),
      ).toBe(1)
    })

    it('should return ~1 for exactly one year from today', () => {
      const oneYearFromNow = addYears(endOfFixedToday, 1)
      const result = calculateDurationFromDate(endOfFixedToday, oneYearFromNow)
      expect(result).toBeGreaterThan(0.99)
      expect(result).toBeLessThan(1.01)
    })

    it('should return ~2 for two years from today', () => {
      const twoYearsFromNow = addYears(endOfFixedToday, 2)
      const result = calculateDurationFromDate(endOfFixedToday, twoYearsFromNow)
      expect(result).toBeGreaterThan(1.99)
      expect(result).toBeLessThan(2.01)
    })

    it('should preserve fractional years (no rounding)', () => {
      const sixMonthsFromNow = addMonths(endOfFixedToday, 6)
      const result = calculateDurationFromDate(
        endOfFixedToday,
        sixMonthsFromNow,
      )
      expect(result).toBeGreaterThan(0.49)
      expect(result).toBeLessThan(0.51)
    })

    it('should preserve fractional years for 1 year and 1 day', () => {
      const justOverOneYear = addYears(endOfFixedToday, 1)
      justOverOneYear.setDate(justOverOneYear.getDate() + 1)
      const result = calculateDurationFromDate(endOfFixedToday, justOverOneYear)
      expect(result).toBeGreaterThan(1)
      expect(result).toBeLessThan(1.01)
    })

    it('should return at least 1', () => {
      const farPast = new Date('2020-01-01')
      expect(calculateDurationFromDate(endOfFixedToday, farPast)).toBe(1)
    })
  })

  describe('getRegistrationDurationInSeconds', () => {
    it('should return ~31557600 for 1 year', () => {
      const oneYearFromNow = addYears(endOfFixedToday, 1)
      expect(
        getRegistrationDurationInSeconds(endOfFixedToday, oneYearFromNow),
      ).toBe(SECONDS_PER_YEAR)
    })

    it('should return ~63115200 for 2 years', () => {
      const twoYearsFromNow = addYears(endOfFixedToday, 2)
      const result = getRegistrationDurationInSeconds(
        endOfFixedToday,
        twoYearsFromNow,
      )
      expect(result).toBeGreaterThanOrEqual(63_000_000)
      expect(result).toBeLessThanOrEqual(63_200_000)
    })

    it('should return at least 1 year in seconds for past dates', () => {
      expect(
        getRegistrationDurationInSeconds(
          endOfFixedToday,
          new Date('2024-01-01'),
        ),
      ).toBe(SECONDS_PER_YEAR)
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

  describe('getRegistrationExpiryDateFromSeconds', () => {
    it('should return date ~1 year from start for SECONDS_PER_YEAR', () => {
      const result = getRegistrationExpiryDateFromSeconds(
        endOfFixedToday,
        SECONDS_PER_YEAR,
      )
      const expectedMs = endOfFixedToday.getTime() + SECONDS_PER_YEAR * 1000
      expect(result.getTime()).toBe(expectedMs)
    })

    it('should round-trip with getRegistrationDurationInSeconds', () => {
      const date = addYears(endOfFixedToday, 2)
      const seconds = getRegistrationDurationInSeconds(endOfFixedToday, date)
      const backToDate = getRegistrationExpiryDateFromSeconds(
        endOfFixedToday,
        seconds,
      )
      expect(backToDate.getTime()).toBe(
        endOfFixedToday.getTime() + seconds * 1000,
      )
    })
  })
})
