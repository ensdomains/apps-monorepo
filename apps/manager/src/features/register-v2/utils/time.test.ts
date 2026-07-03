import { describe, expect, it } from 'vitest'
import {
  formatDurationSecondsForDisplay,
  getCanonicalDurationYears,
  getDurationExpiryDateForDisplay,
  getDurationInSecondsFromYears,
  SECONDS_IN_YEAR,
} from './time'

describe('register-v2 time utils', () => {
  describe('getDurationInSecondsFromYears', () => {
    it('returns the contract threshold when the calendar span is shorter', () => {
      const result = getDurationInSecondsFromYears(
        2,
        new Date('2025-01-15T12:00:00.000Z'),
      )

      expect(result).toBe(2 * SECONDS_IN_YEAR)
      expect(result).toBeGreaterThan(730 * 86_400)
    })

    it('returns the full calendar span when it is larger than the contract threshold', () => {
      const result = getDurationInSecondsFromYears(
        3,
        new Date('2026-01-01T18:30:00.000Z'),
      )

      expect(result).toBe(1096 * 86_400)
    })

    it('floors and clamps values below one year to one year', () => {
      expect(getDurationInSecondsFromYears(0.5, new Date('2025-01-15'))).toBe(
        SECONDS_IN_YEAR,
      )
    })
  })

  describe('preset display helpers', () => {
    it('formats canonical preset durations as whole years', () => {
      const referenceDate = new Date('2026-01-01T18:30:00.000Z')
      const duration = getDurationInSecondsFromYears(3, referenceDate)

      expect(formatDurationSecondsForDisplay(duration, referenceDate)).toBe(
        '3 years',
      )
    })

    it('does not treat a manual duration just below the threshold as a preset', () => {
      const referenceDate = new Date('2025-01-15T12:00:00.000Z')
      const duration = getDurationInSecondsFromYears(2, referenceDate) - 43_200

      expect(getCanonicalDurationYears(duration, referenceDate)).toBeNull()
    })

    it('keeps preset expiry display on the same calendar date', () => {
      const referenceDate = new Date('2025-01-15T21:00:00.000Z')
      const duration = getDurationInSecondsFromYears(2, referenceDate)
      const expiryDate = getDurationExpiryDateForDisplay(
        duration,
        referenceDate,
      )

      expect(expiryDate.getFullYear()).toBe(2027)
      expect(expiryDate.getMonth()).toBe(0)
      expect(expiryDate.getDate()).toBe(15)
    })
  })
})
