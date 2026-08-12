import { describe, expect, it } from 'vitest'
import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
} from '@/lib/constants/duration'
import {
  formatCalendarDuration,
  getDurationFromPickerDate,
  getDurationInSecondsFromYears,
  getExpiryDateForPicker,
  getMaxExpiryDateForPicker,
  getMinExpiryDateForPicker,
  getRegistrationDisplayDates,
  getRegistrationDurationInSeconds,
  getRegistrationExpiryDateFromSeconds,
  getYearsFromDuration,
} from './registrationDuration'

describe('registrationDuration', () => {
  const startOfFixedToday = Temporal.PlainDate.from('2025-01-15')

  describe('formatCalendarDuration', () => {
    const span = (from: string, to: string) =>
      formatCalendarDuration(
        Temporal.PlainDate.from(from),
        Temporal.PlainDate.from(to),
      )

    it('formats years, months and days, singular and plural', () => {
      expect(span('2030-01-01', '2031-01-01')).toBe('1 year')
      expect(span('2030-01-01', '2033-03-03')).toBe('3 years 2 months 2 days')
      expect(span('2030-01-01', '2030-02-02')).toBe('1 month 1 day')
      expect(span('2030-01-01', '2030-01-16')).toBe('15 days')
    })

    it('distinguishes a day past a whole-year target from the target', () => {
      // Both printed "1 year" when this divided seconds by a 365.25-day year.
      expect(span('2033-08-06', '2034-08-06')).toBe('1 year')
      expect(span('2033-08-06', '2034-08-07')).toBe('1 year 1 day')
    })

    it('treats a leap-day start constrained to Feb 28 as a whole year', () => {
      expect(span('2028-02-29', '2029-02-28')).toBe('1 year')
    })

    it('returns 0 days for an empty span', () => {
      expect(span('2030-01-01', '2030-01-01')).toBe('0 days')
    })
  })

  describe('getRegistrationDisplayDates', () => {
    it('reports whole years for every year preset', () => {
      const baseDate = Temporal.PlainDate.from('2033-08-06')

      for (const years of [1, 2, 3, 6, 10]) {
        expect(
          getRegistrationDisplayDates(
            getDurationInSecondsFromYears(years, baseDate),
            baseDate,
          ).registrationPeriod,
        ).toBe(years === 1 ? '1 year' : `${years} years`)
      }
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
    // The function now returns `years × CONTRACT_SECONDS_PER_YEAR` (365.25
    // days/year) so the duration sent to the contract aligns with the
    // oracle's annualised list rate. See the JSDoc for the tradeoff.
    it('should return exactly CONTRACT_SECONDS_PER_YEAR for 1 year', () => {
      expect(getDurationInSecondsFromYears(1, startOfFixedToday)).toBe(
        CONTRACT_SECONDS_PER_YEAR,
      )
    })

    it('should return N × CONTRACT_SECONDS_PER_YEAR for N years', () => {
      expect(getDurationInSecondsFromYears(3, startOfFixedToday)).toBe(
        3 * CONTRACT_SECONDS_PER_YEAR,
      )
    })

    it('should return at least 1 year for values less than 1', () => {
      expect(getDurationInSecondsFromYears(0.5, startOfFixedToday)).toBe(
        CONTRACT_SECONDS_PER_YEAR,
      )
    })

    it('expiry from 3-year duration lands on the calendar 3-years-later date', () => {
      // 3y from Jan 1 2026: flat = 1095.75 d, calendar = 1096 d (Feb 29
      // 2028 inside). max(flat, calendar) picks calendar → 1096 days →
      // Jan 1 2029 — what the user expects from "3 years".
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

    // The ENS registrar computes expiry = block.timestamp + duration. These
    // tests verify that getDurationFromPickerDate produces a duration that
    // round-trips back to exactly the calendar date the user selected, so the
    // on-chain expiry always lands on (not before) the chosen date regardless
    // of the time of day registration occurs.
    describe('calendar date round-trip (picker → duration → expiry date)', () => {
      it('should recover the exact picked date for a 1-year selection', () => {
        const picked = startOfFixedToday.add({ years: 1 })
        const duration = getDurationFromPickerDate(picked, startOfFixedToday)
        const recovered = getRegistrationExpiryDateFromSeconds(
          startOfFixedToday,
          duration,
        )
        expect(recovered.toString()).toBe(picked.toString())
      })

      it('should recover the exact picked date for a 2-year selection', () => {
        const picked = startOfFixedToday.add({ years: 2 })
        const duration = getDurationFromPickerDate(picked, startOfFixedToday)
        const recovered = getRegistrationExpiryDateFromSeconds(
          startOfFixedToday,
          duration,
        )
        expect(recovered.toString()).toBe(picked.toString())
      })

      it('should recover the exact picked date across a leap year boundary', () => {
        // 2026-01-15 → 2028-01-15 crosses the Feb 29 2028 leap day
        const leapStart = Temporal.PlainDate.from('2026-01-15')
        const picked = leapStart.add({ years: 2 })
        const duration = getDurationFromPickerDate(picked, leapStart)
        const recovered = getRegistrationExpiryDateFromSeconds(
          leapStart,
          duration,
        )
        expect(recovered.toString()).toBe(picked.toString())
      })

      it('should recover the exact picked date for a 6-month selection', () => {
        const picked = startOfFixedToday.add({ months: 6 })
        const duration = getDurationFromPickerDate(picked, startOfFixedToday)
        const recovered = getRegistrationExpiryDateFromSeconds(
          startOfFixedToday,
          duration,
        )
        expect(recovered.toString()).toBe(picked.toString())
      })

      it('on-chain expiry lands on the picked date, not one day early', () => {
        // With the old +86399 offset the recovered date would be one day later
        // than picked (extra ~24 h pushed it past midnight). Without the offset,
        // duration = days * 86400 maps exactly to the calendar day.
        const picked = Temporal.PlainDate.from('2026-07-04')
        const today = Temporal.PlainDate.from('2025-07-04')
        const duration = getDurationFromPickerDate(picked, today)
        const recovered = getRegistrationExpiryDateFromSeconds(today, duration)
        expect(recovered.toString()).toBe('2026-07-04')
        // Sanity: duration is exactly 365 days in seconds (no leap year here)
        expect(duration).toBe(365 * 86400)
      })
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
