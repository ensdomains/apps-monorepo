import { addMonths, addYears } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'
import {
  calculateDurationFromDate,
  formatDurationLabel,
  formatRegistrationDuration,
  getDurationFromPickerDate,
  getDurationInSecondsFromYears,
  getExpiryDateForPicker,
  getRegistrationDurationInSeconds,
  getRegistrationExpiryDateFromSeconds,
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
    it('should return ~31557600 for 1 year', () => {
      const oneYearFromNow = addYears(startOfFixedToday, 1)
      expect(
        getRegistrationDurationInSeconds(startOfFixedToday, oneYearFromNow),
      ).toBe(SECONDS_PER_YEAR)
    })

    it('should return ~63115200 for 2 years', () => {
      const twoYearsFromNow = addYears(startOfFixedToday, 2)
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        twoYearsFromNow,
      )
      expect(result).toBeGreaterThanOrEqual(63_000_000)
      expect(result).toBeLessThanOrEqual(63_200_000)
    })

    it('should return at least 1 year in seconds for past dates', () => {
      expect(
        getRegistrationDurationInSeconds(
          startOfFixedToday,
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

  describe('formatDurationLabel', () => {
    it('should return "1 year" for 1 year duration', () => {
      expect(formatDurationLabel(SECONDS_PER_YEAR, startOfFixedToday)).toBe(
        '1 year',
      )
    })

    it('should return "2 years" for 2 year duration', () => {
      expect(formatDurationLabel(2 * SECONDS_PER_YEAR, startOfFixedToday)).toBe(
        '2 years',
      )
    })
  })

  describe('getExpiryDateForPicker', () => {
    it('should return end of expiry day for 1 year duration', () => {
      const result = getExpiryDateForPicker(SECONDS_PER_YEAR, startOfFixedToday)
      const expectedMs = startOfFixedToday.getTime() + SECONDS_PER_YEAR * 1000
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMs - 86400_000)
      expect(result.getTime()).toBeLessThanOrEqual(expectedMs + 86400_000)
    })
  })

  describe('getDurationFromPickerDate', () => {
    it('should round-trip with getExpiryDateForPicker', () => {
      const duration = 2 * SECONDS_PER_YEAR
      const date = getExpiryDateForPicker(duration, startOfFixedToday)
      const result = getDurationFromPickerDate(date, startOfFixedToday)
      expect(result).toBeGreaterThanOrEqual(63_000_000)
      expect(result).toBeLessThanOrEqual(63_200_000)
    })
  })

  describe('getRegistrationExpiryDateFromSeconds', () => {
    it('should return date ~1 year from start for SECONDS_PER_YEAR', () => {
      const result = getRegistrationExpiryDateFromSeconds(
        startOfFixedToday,
        SECONDS_PER_YEAR,
      )
      const expectedMs = startOfFixedToday.getTime() + SECONDS_PER_YEAR * 1000
      expect(result.getTime()).toBe(expectedMs)
    })

    it('should round-trip with getRegistrationDurationInSeconds', () => {
      const date = addYears(startOfFixedToday, 2)
      const seconds = getRegistrationDurationInSeconds(startOfFixedToday, date)
      const backToDate = getRegistrationExpiryDateFromSeconds(
        startOfFixedToday,
        seconds,
      )
      expect(backToDate.getTime()).toBe(
        startOfFixedToday.getTime() + seconds * 1000,
      )
    })
  })
})
