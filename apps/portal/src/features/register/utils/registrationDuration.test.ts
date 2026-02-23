import { addMonths, addYears } from 'date-fns'
import { describe, expect, it } from 'vitest'
import {
  calculateDurationFromDate,
  formatDurationLabel,
  formatRegistrationDuration,
  getDurationFromPickerDate,
  getDurationInSecondsFromYears,
  getExpiryDateForPicker,
  getRegistrationDurationInSeconds,
  getRegistrationExpiryDateFromSeconds,
  getYearsFromDuration,
} from './registrationDuration'

describe('registrationDuration', () => {
  const startOfFixedToday = new Date('2025-01-15T00:00:00Z')

  describe('formatRegistrationDuration', () => {
    it('should return "1 year" when expiry is today or in the past', () => {
      expect(
        formatRegistrationDuration(
          startOfFixedToday,
          new Date('2025-01-15T00:00:00Z'),
        ),
      ).toBe('1 year')
      expect(
        formatRegistrationDuration(startOfFixedToday, new Date('2024-06-01')),
      ).toBe('1 year')
    })

    it('should return "1 year" for exactly one year from today', () => {
      const oneYearFromNow = addYears(startOfFixedToday, 1)
      expect(
        formatRegistrationDuration(startOfFixedToday, oneYearFromNow),
      ).toBe('1 year')
    })

    it('should return "2 years" for two years from today', () => {
      const twoYearsFromNow = addYears(startOfFixedToday, 2)
      expect(
        formatRegistrationDuration(startOfFixedToday, twoYearsFromNow),
      ).toBe('2 years')
    })

    it('should return "1 year 3 months" for 1 year 3 months from today', () => {
      const target = addYears(addMonths(startOfFixedToday, 3), 1)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 year 3 months',
      )
    })

    it('should return "2 years 6 months" for 2 years 6 months from today', () => {
      const target = addYears(addMonths(startOfFixedToday, 6), 2)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '2 years 6 months',
      )
    })

    it('should return "1 month" for one month from today', () => {
      const target = addMonths(startOfFixedToday, 1)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 month',
      )
    })

    it('should return "6 months" for six months from today', () => {
      const target = addMonths(startOfFixedToday, 6)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '6 months',
      )
    })

    it('should return "1 day" for one day from today', () => {
      const target = new Date(startOfFixedToday)
      target.setDate(target.getDate() + 1)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 day',
      )
    })

    it('should return "15 days" for 15 days from today (no months)', () => {
      const target = new Date(startOfFixedToday)
      target.setDate(target.getDate() + 15)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '15 days',
      )
    })

    it('should not include days when months are present', () => {
      const target = addMonths(startOfFixedToday, 1)
      target.setDate(target.getDate() + 5)
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 month',
      )
    })
  })

  describe('calculateDurationFromDate', () => {
    it('should return 1 when target is today or in the past', () => {
      expect(
        calculateDurationFromDate(
          startOfFixedToday,
          new Date('2025-01-15T00:00:00Z'),
        ),
      ).toBe(1)
      expect(
        calculateDurationFromDate(startOfFixedToday, new Date('2024-01-01')),
      ).toBe(1)
    })

    it('should return ~1 for exactly one year from today', () => {
      const oneYearFromNow = addYears(startOfFixedToday, 1)
      const result = calculateDurationFromDate(
        startOfFixedToday,
        oneYearFromNow,
      )
      expect(result).toBeGreaterThan(0.99)
      expect(result).toBeLessThan(1.01)
    })

    it('should return ~2 for two years from today', () => {
      const twoYearsFromNow = addYears(startOfFixedToday, 2)
      const result = calculateDurationFromDate(
        startOfFixedToday,
        twoYearsFromNow,
      )
      expect(result).toBeGreaterThan(1.99)
      expect(result).toBeLessThan(2.01)
    })

    it('should preserve fractional years (no rounding)', () => {
      const sixMonthsFromNow = addMonths(startOfFixedToday, 6)
      const result = calculateDurationFromDate(
        startOfFixedToday,
        sixMonthsFromNow,
      )
      expect(result).toBeGreaterThan(0.49)
      expect(result).toBeLessThan(0.51)
    })

    it('should preserve fractional years for 1 year and 1 day', () => {
      const justOverOneYear = addYears(startOfFixedToday, 1)
      justOverOneYear.setDate(justOverOneYear.getDate() + 1)
      const result = calculateDurationFromDate(
        startOfFixedToday,
        justOverOneYear,
      )
      expect(result).toBeGreaterThan(1)
      expect(result).toBeLessThan(1.01)
    })

    it('should return at least 1', () => {
      const farPast = new Date('2020-01-01')
      expect(calculateDurationFromDate(startOfFixedToday, farPast)).toBe(1)
    })
  })

  describe('getRegistrationDurationInSeconds', () => {
    it('should return exact seconds for 1 calendar year', () => {
      const oneYearFromNow = addYears(startOfFixedToday, 1)
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        oneYearFromNow,
      )
      expect(result).toBe(31_536_000) // 365 days in 2025
    })

    it('should return exact seconds for 2 calendar years', () => {
      const twoYearsFromNow = addYears(startOfFixedToday, 2)
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        twoYearsFromNow,
      )
      expect(result).toBe(63_072_000) // 730 days (2025, 2026 non-leap)
    })

    it('should return at least 1 year in seconds for past dates', () => {
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        new Date('2024-01-01'),
      )
      expect(result).toBe(31_536_000) // min 1 year
    })
  })

  describe('getDurationInSecondsFromYears', () => {
    it('should return exact seconds for 1 calendar year', () => {
      expect(getDurationInSecondsFromYears(1, startOfFixedToday)).toBe(
        31_536_000,
      ) // 365 days
    })

    it('should return exact seconds for 3 calendar years', () => {
      const result = getDurationInSecondsFromYears(3, startOfFixedToday)
      const expectedExpiry = addYears(startOfFixedToday, 3)
      const expectedSeconds = Math.floor(
        (expectedExpiry.getTime() - startOfFixedToday.getTime()) / 1000,
      )
      expect(result).toBe(expectedSeconds)
    })

    it('should return at least 1 year for values less than 1', () => {
      expect(getDurationInSecondsFromYears(0.5, startOfFixedToday)).toBe(
        31_536_000,
      )
    })

    it('should give Jan 1 2029 for 3 years from Jan 1 2026', () => {
      const jan1_2026 = new Date('2026-01-01T00:00:00Z')
      const duration = getDurationInSecondsFromYears(3, jan1_2026)
      const expiry = getRegistrationExpiryDateFromSeconds(jan1_2026, duration)
      expect(expiry.getFullYear()).toBe(2029)
      expect(expiry.getMonth()).toBe(0)
      expect(expiry.getDate()).toBe(1)
    })
  })

  describe('formatDurationLabel', () => {
    it('should return "1 year" for 1 year duration', () => {
      const duration = getDurationInSecondsFromYears(1, startOfFixedToday)
      expect(formatDurationLabel(duration, startOfFixedToday)).toBe('1 year')
    })

    it('should return "3 years" for 3 year duration', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      expect(formatDurationLabel(duration, startOfFixedToday)).toBe('3 years')
    })
  })

  describe('getYearsFromDuration', () => {
    it('should return 3 for 3 year duration', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      expect(getYearsFromDuration(duration, startOfFixedToday)).toBe(3)
    })
  })

  describe('getExpiryDateForPicker', () => {
    it('should return Jan 15 2026 end of day for 1 year from Jan 15 2025', () => {
      const duration = getDurationInSecondsFromYears(1, startOfFixedToday)
      const result = getExpiryDateForPicker(duration, startOfFixedToday)
      const expectedExpiry = addYears(startOfFixedToday, 1)
      expect(result.getDate()).toBe(expectedExpiry.getDate())
      expect(result.getMonth()).toBe(expectedExpiry.getMonth())
      expect(result.getFullYear()).toBe(expectedExpiry.getFullYear())
    })
  })

  describe('getDurationFromPickerDate', () => {
    it('should round-trip years: 3 years → date picker → 3 years', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      const date = getExpiryDateForPicker(duration, startOfFixedToday)
      const result = getDurationFromPickerDate(date, startOfFixedToday)
      expect(getYearsFromDuration(result, startOfFixedToday)).toBe(3)
    })
  })

  describe('getRegistrationExpiryDateFromSeconds', () => {
    it('should return Jan 15 2026 for 1 year from Jan 15 2025', () => {
      const duration = getDurationInSecondsFromYears(1, startOfFixedToday)
      const result = getRegistrationExpiryDateFromSeconds(
        startOfFixedToday,
        duration,
      )
      const expected = addYears(startOfFixedToday, 1)
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('should round-trip: 3 years picker → date picker → 3 years', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      const expiry = getRegistrationExpiryDateFromSeconds(
        startOfFixedToday,
        duration,
      )
      expect(expiry.getFullYear()).toBe(2028)
      expect(expiry.getMonth()).toBe(0) // Jan
      expect(expiry.getDate()).toBe(15)
    })
  })
})
