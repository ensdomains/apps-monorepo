import { describe, expect, it } from 'vitest'
import { MAX_REGISTRATION_YEARS } from '@/lib/constants/duration'
import {
  calculateDurationFromDate,
  formatRegistrationDuration,
  getDurationFromPickerDate,
  getDurationInSecondsFromYears,
  getExpiryDateForPicker,
  getMaxExpiryDateForPicker,
  getMinExpiryDateForPicker,
  getRegistrationDurationInSeconds,
  getRegistrationExpiryDateFromSeconds,
  getYearsFromDuration,
} from './registrationDuration'

describe('registrationDuration', () => {
  const startOfFixedToday = Temporal.PlainDate.from('2025-01-15')

  describe('formatRegistrationDuration', () => {
    it('should throw when expiry is today or in the past', () => {
      expect(() =>
        formatRegistrationDuration(
          startOfFixedToday,
          Temporal.PlainDate.from('2025-01-15'),
        ),
      ).toThrow('Expiry date must be after start date')
      expect(() =>
        formatRegistrationDuration(
          startOfFixedToday,
          Temporal.PlainDate.from('2024-06-01'),
        ),
      ).toThrow('Expiry date must be after start date')
    })

    it('should return "1 year" for exactly one year from today', () => {
      const oneYearFromNow = startOfFixedToday.add({ years: 1 })
      expect(
        formatRegistrationDuration(startOfFixedToday, oneYearFromNow),
      ).toBe('1 year')
    })

    it('should return "2 years" for two years from today', () => {
      const twoYearsFromNow = startOfFixedToday.add({ years: 2 })
      expect(
        formatRegistrationDuration(startOfFixedToday, twoYearsFromNow),
      ).toBe('2 years')
    })

    it('should return "1 year 3 months" for 1 year 3 months from today', () => {
      const target = startOfFixedToday.add({ years: 1, months: 3 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 year 3 months',
      )
    })

    it('should return "2 years 6 months" for 2 years 6 months from today', () => {
      const target = startOfFixedToday.add({ years: 2, months: 6 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '2 years 6 months',
      )
    })

    it('should return "1 month" for one month from today', () => {
      const target = startOfFixedToday.add({ months: 1 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 month',
      )
    })

    it('should return "6 months" for six months from today', () => {
      const target = startOfFixedToday.add({ months: 6 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '6 months',
      )
    })

    it('should return "1 day" for one day from today', () => {
      const target = startOfFixedToday.add({ days: 1 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 day',
      )
    })

    it('should return "15 days" for 15 days from today (no months)', () => {
      const target = startOfFixedToday.add({ days: 15 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '15 days',
      )
    })

    it('should include days when months and extra days are present', () => {
      const target = startOfFixedToday.add({ months: 1, days: 5 })
      expect(formatRegistrationDuration(startOfFixedToday, target)).toBe(
        '1 month 5 days',
      )
    })
  })

  describe('calculateDurationFromDate', () => {
    it('should return 1 when target is today or in the past', () => {
      expect(
        calculateDurationFromDate(
          startOfFixedToday,
          Temporal.PlainDate.from('2025-01-15'),
        ),
      ).toBe(1)
      expect(
        calculateDurationFromDate(
          startOfFixedToday,
          Temporal.PlainDate.from('2024-01-01'),
        ),
      ).toBe(1)
    })

    it('should return ~1 for exactly one year from today', () => {
      const oneYearFromNow = startOfFixedToday.add({ years: 1 })
      const result = calculateDurationFromDate(
        startOfFixedToday,
        oneYearFromNow,
      )
      expect(result).toBeGreaterThan(0.99)
      expect(result).toBeLessThan(1.01)
    })

    it('should return ~2 for two years from today', () => {
      const twoYearsFromNow = startOfFixedToday.add({ years: 2 })
      const result = calculateDurationFromDate(
        startOfFixedToday,
        twoYearsFromNow,
      )
      expect(result).toBeGreaterThan(1.99)
      expect(result).toBeLessThan(2.01)
    })

    it('should preserve fractional years (no rounding)', () => {
      const sixMonthsFromNow = startOfFixedToday.add({ months: 6 })
      const result = calculateDurationFromDate(
        startOfFixedToday,
        sixMonthsFromNow,
      )
      expect(result).toBeGreaterThan(0.49)
      expect(result).toBeLessThan(0.51)
    })

    it('should return at least 1', () => {
      const farPast = Temporal.PlainDate.from('2020-01-01')
      expect(calculateDurationFromDate(startOfFixedToday, farPast)).toBe(1)
    })
  })

  describe('getRegistrationDurationInSeconds', () => {
    it('should return exact seconds for 1 calendar year', () => {
      const oneYearFromNow = startOfFixedToday.add({ years: 1 })
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        oneYearFromNow,
      )
      expect(result).toBe(31_536_000) // 365 days in 2025
    })

    it('should return exact seconds for 2 calendar years', () => {
      const twoYearsFromNow = startOfFixedToday.add({ years: 2 })
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        twoYearsFromNow,
      )
      expect(result).toBe(63_072_000) // 730 days (2025, 2026 non-leap)
    })

    it('should return at least 28 days in seconds for past dates', () => {
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        Temporal.PlainDate.from('2024-01-01'),
      )
      expect(result).toBe(2_419_200) // min 28 days
    })

    it('should return exact seconds for 6 months (short duration)', () => {
      const sixMonthsFromNow = startOfFixedToday.add({ months: 6 })
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        sixMonthsFromNow,
      )
      const expectedDays = startOfFixedToday.until(sixMonthsFromNow, {
        largestUnit: 'days',
      }).days
      expect(result).toBe(expectedDays * 86400)
    })

    it('should return 28 days minimum for tomorrow', () => {
      const tomorrow = startOfFixedToday.add({ days: 1 })
      const result = getRegistrationDurationInSeconds(
        startOfFixedToday,
        tomorrow,
      )
      expect(result).toBe(2_419_200) // min 28 days
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
      const expectedExpiry = startOfFixedToday.add({ years: 3 })
      const expectedDays = startOfFixedToday.until(expectedExpiry, {
        largestUnit: 'days',
      }).days
      expect(result).toBe(expectedDays * 86400)
    })

    it('should return at least 1 year for values less than 1', () => {
      expect(getDurationInSecondsFromYears(0.5, startOfFixedToday)).toBe(
        31_536_000,
      )
    })

    it('should give Jan 1 2029 for 3 years from Jan 1 2026', () => {
      const jan1_2026 = Temporal.PlainDate.from('2026-01-01')
      const duration = getDurationInSecondsFromYears(3, jan1_2026)
      const expiry = getRegistrationExpiryDateFromSeconds(jan1_2026, duration)
      expect(expiry.year).toBe(2029)
      expect(expiry.month).toBe(1)
      expect(expiry.day).toBe(1)
    })

    it('should cap at MAX_REGISTRATION_YEARS when years exceed max', () => {
      const result = getDurationInSecondsFromYears(5000, startOfFixedToday)
      const expected = getDurationInSecondsFromYears(
        MAX_REGISTRATION_YEARS,
        startOfFixedToday,
      )
      expect(result).toBe(expected)
    })

    it('should cap at MAX_REGISTRATION_YEARS for very large values', () => {
      const result = getDurationInSecondsFromYears(
        100_000_000,
        startOfFixedToday,
      )
      const expected = getDurationInSecondsFromYears(
        MAX_REGISTRATION_YEARS,
        startOfFixedToday,
      )
      expect(result).toBe(expected)
    })

    it('should floor fractional years before capping', () => {
      const result = getDurationInSecondsFromYears(1500.7, startOfFixedToday)
      const expected = getDurationInSecondsFromYears(
        MAX_REGISTRATION_YEARS,
        startOfFixedToday,
      )
      expect(result).toBe(expected)
    })
  })

  describe('getMinExpiryDateForPicker', () => {
    it('should return 28 days from start date', () => {
      const result = getMinExpiryDateForPicker(startOfFixedToday)
      const expected = startOfFixedToday.add({ days: 28 })
      expect(result.toString()).toBe(expected.toString())
    })
  })

  describe('getMaxExpiryDateForPicker', () => {
    it('should return MAX_REGISTRATION_YEARS from start date', () => {
      const result = getMaxExpiryDateForPicker(startOfFixedToday)
      const expected = startOfFixedToday.add({ years: MAX_REGISTRATION_YEARS })
      expect(result.toString()).toBe(expected.toString())
    })

    it('should return year 3025 for Jan 15 2025 start with 1000 years', () => {
      const result = getMaxExpiryDateForPicker(startOfFixedToday)
      expect(result.year).toBe(2025 + MAX_REGISTRATION_YEARS)
    })
  })

  describe('getYearsFromDuration', () => {
    it('should return 3 for 3 year duration', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      expect(getYearsFromDuration(duration, startOfFixedToday)).toBe(3)
    })
  })

  describe('getExpiryDateForPicker', () => {
    it('should return Jan 15 2026 for 1 year from Jan 15 2025', () => {
      const duration = getDurationInSecondsFromYears(1, startOfFixedToday)
      const result = getExpiryDateForPicker(duration, startOfFixedToday)
      const expectedExpiry = startOfFixedToday.add({ years: 1 })
      expect(result.day).toBe(expectedExpiry.day)
      expect(result.month).toBe(expectedExpiry.month)
      expect(result.year).toBe(expectedExpiry.year)
    })
  })

  describe('getDurationFromPickerDate', () => {
    it('should round-trip years: 3 years → date picker → 3 years', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      const date = getExpiryDateForPicker(duration, startOfFixedToday)
      const result = getDurationFromPickerDate(date, startOfFixedToday)
      expect(getYearsFromDuration(result, startOfFixedToday)).toBe(3)
    })

    it('should cap duration when date is beyond max expiry', () => {
      const maxExpiry = getMaxExpiryDateForPicker(startOfFixedToday)
      const beyondMax = maxExpiry.add({ years: 100 })
      const result = getDurationFromPickerDate(beyondMax, startOfFixedToday)
      const expectedDuration = getDurationInSecondsFromYears(
        MAX_REGISTRATION_YEARS,
        startOfFixedToday,
      )
      // Both should resolve to the same number of years
      expect(getYearsFromDuration(result, startOfFixedToday)).toBe(
        getYearsFromDuration(expectedDuration, startOfFixedToday),
      )
    })
  })

  describe('getRegistrationExpiryDateFromSeconds', () => {
    it('should return Jan 15 2026 for 1 year from Jan 15 2025', () => {
      const duration = getDurationInSecondsFromYears(1, startOfFixedToday)
      const result = getRegistrationExpiryDateFromSeconds(
        startOfFixedToday,
        duration,
      )
      const expected = startOfFixedToday.add({ years: 1 })
      expect(result.toString()).toBe(expected.toString())
    })

    it('should round-trip: 3 years → expiry date → correct year/month/day', () => {
      const duration = getDurationInSecondsFromYears(3, startOfFixedToday)
      const expiry = getRegistrationExpiryDateFromSeconds(
        startOfFixedToday,
        duration,
      )
      expect(expiry.year).toBe(2028)
      expect(expiry.month).toBe(1) // January
      expect(expiry.day).toBe(15)
    })
  })
})
