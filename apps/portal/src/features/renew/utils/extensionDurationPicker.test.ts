import { describe, expect, it } from 'vitest'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import {
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
  SECONDS_PER_DAY,
} from '@/lib/constants/duration'
import {
  getExtensionDisplayedYears,
  getExtensionDurationSeconds,
  getExtensionTargetDate,
  getToggledExtensionSpan,
} from './extensionDurationPicker'

const plainDate = (value: string) => Temporal.PlainDate.from(value)

describe('extensionDurationPicker', () => {
  describe('getExtensionTargetDate', () => {
    it('adds whole calendar years in years mode', () => {
      expect(
        getExtensionTargetDate(plainDate('2026-01-01'), {
          type: 'years',
          years: 2,
        }).toString(),
      ).toBe('2028-01-01')
    })

    it('is the picked date itself in date mode', () => {
      expect(
        getExtensionTargetDate(plainDate('2026-01-01'), {
          type: 'date',
          date: plainDate('2026-04-15'),
        }).toString(),
      ).toBe('2026-04-15')
    })
  })

  describe('getExtensionDurationSeconds', () => {
    it('charges the contract year in years mode', () => {
      expect(
        getExtensionDurationSeconds(plainDate('2026-01-01'), {
          type: 'years',
          years: 2,
        }),
      ).toBe(getDurationInSecondsFromYears(2, plainDate('2026-01-01')))
    })

    it('charges whole days for a date that is not a year target', () => {
      const baseDate = plainDate('2026-01-01')

      expect(
        getExtensionDurationSeconds(baseDate, {
          type: 'date',
          date: plainDate('2026-03-01'),
        }),
      ).toBe(59 * SECONDS_PER_DAY)
    })

    it.each([
      1, 2, 3, 6,
    ])('charges %i whole contract years for a date on that year target', (years) => {
      // Day-counting alone lands ~6h/yr short of the contract year and drops
      // the term below the oracle's discount tier, so the chip would price as
      // "N-1 years 11 months 29 days" once re-picked off the calendar.
      const baseDate = plainDate('2028-08-06')

      expect(
        getExtensionDurationSeconds(baseDate, {
          type: 'date',
          date: getExtensionTargetDate(baseDate, { type: 'years', years }),
        }),
      ).toBe(getDurationInSecondsFromYears(years, baseDate))
    })

    it('treats a leap-day expiry constrained to Feb 28 as a whole year', () => {
      const baseDate = plainDate('2028-02-29')

      expect(
        getExtensionDurationSeconds(baseDate, {
          type: 'date',
          date: plainDate('2029-02-28'),
        }),
      ).toBe(getDurationInSecondsFromYears(1, baseDate))
    })

    it('falls back to the minimum for a target at or before the expiry', () => {
      // Unreachable from the picker (its min date is expiry + 28 days), but the
      // contract cannot shorten an expiry, so never emit a negative duration.
      expect(
        getExtensionDurationSeconds(plainDate('2040-01-01'), {
          type: 'date',
          date: plainDate('2030-01-01'),
        }),
      ).toBe(MIN_REGISTRATION_DURATION)
    })

    it('measures each name from its own expiry towards a shared target', () => {
      const date = plainDate('2029-01-01')

      expect(
        [plainDate('2026-01-01'), plainDate('2027-01-01')].map((baseDate) =>
          getExtensionDurationSeconds(baseDate, { type: 'date', date }),
        ),
      ).toEqual([1096 * SECONDS_PER_DAY, 731 * SECONDS_PER_DAY])
    })
  })

  describe('getExtensionDisplayedYears', () => {
    it('floors a date-mode span to whole years, at least one', () => {
      const baseDate = plainDate('2026-01-01')

      expect(
        getExtensionDisplayedYears(baseDate, {
          type: 'date',
          date: plainDate('2028-06-01'),
        }),
      ).toBe(2)
      expect(
        getExtensionDisplayedYears(baseDate, {
          type: 'date',
          date: plainDate('2026-04-01'),
        }),
      ).toBe(1)
    })

    it('clamps years mode to the registration maximum', () => {
      expect(
        getExtensionDisplayedYears(plainDate('2026-01-01'), {
          type: 'years',
          years: MAX_REGISTRATION_YEARS + 1,
        }),
      ).toBe(MAX_REGISTRATION_YEARS)
    })
  })

  describe('getToggledExtensionSpan', () => {
    it.each([
      1, 3, 10,
    ])('keeps %i years priced the same through a toggle', (years) => {
      const baseDate = plainDate('2030-06-15')
      const span = { type: 'years', years } as const

      expect(
        getExtensionDurationSeconds(
          baseDate,
          getToggledExtensionSpan(baseDate, span),
        ),
      ).toBe(getExtensionDurationSeconds(baseDate, span))
    })

    it('round-trips a date span back to itself', () => {
      const baseDate = plainDate('2030-06-15')
      const span = { type: 'date', date: plainDate('2033-06-15') } as const
      const roundTripped = getToggledExtensionSpan(
        baseDate,
        getToggledExtensionSpan(baseDate, span),
      )

      expect(getExtensionTargetDate(baseDate, roundTripped).toString()).toBe(
        '2033-06-15',
      )
    })
  })
})
