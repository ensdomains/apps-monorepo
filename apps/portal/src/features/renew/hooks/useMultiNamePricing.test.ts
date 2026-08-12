import { describe, expect, it } from 'vitest'
import {
  CONTRACT_SECONDS_PER_YEAR,
  MIN_REGISTRATION_DURATION,
} from '@/lib/constants/duration'
import {
  getLatestRenewalExpiry,
  getRenewalDurationSeconds,
} from './useMultiNamePricing'

const plainDate = (value: string) => Temporal.PlainDate.from(value)

describe('useMultiNamePricing pure helpers', () => {
  describe('getLatestRenewalExpiry', () => {
    it('returns the latest expiry date across selected names', () => {
      const latest = new Date('2027-06-15T00:00:00.000Z')
      const result = getLatestRenewalExpiry([
        {
          name: 'alpha.eth',
          isV2: false,
          expiryDate: new Date('2026-01-01T00:00:00.000Z'),
        },
        { name: 'beta.eth', isV2: true, expiryDate: latest },
        {
          name: 'gamma.eth',
          isV2: false,
          expiryDate: new Date('2027-03-10T00:00:00.000Z'),
        },
      ])

      expect(result).toEqual(latest)
    })

    it('ignores names without an expiry date', () => {
      const latest = new Date('2026-08-20T00:00:00.000Z')
      const result = getLatestRenewalExpiry([
        { name: 'alpha.eth', isV2: false, expiryDate: null },
        { name: 'beta.eth', isV2: true },
        { name: 'gamma.eth', isV2: false, expiryDate: latest },
      ])

      expect(result).toEqual(latest)
    })

    it('returns null when no names have an expiry date', () => {
      const result = getLatestRenewalExpiry([
        { name: 'alpha.eth', isV2: false, expiryDate: null },
        { name: 'beta.eth', isV2: true },
      ])

      expect(result).toBeNull()
    })
  })

  describe('getRenewalDurationSeconds', () => {
    it('converts years mode using CONTRACT_SECONDS_PER_YEAR', () => {
      const result = getRenewalDurationSeconds({
        spanType: 'years',
        duration: 2,
        baseDate: plainDate('2026-01-01'),
      })

      expect(result).toBe(2 * CONTRACT_SECONDS_PER_YEAR)
    })

    it('converts date mode using the provided target timestamp and base date', () => {
      const result = getRenewalDurationSeconds({
        spanType: 'date',
        // Local midnight — the picker builds date-mode timestamps with
        // `plainDateToDate`, which is local, not UTC.
        duration: new Date(2026, 2, 1).getTime(),
        baseDate: plainDate('2026-01-01'),
      })

      // Jan 1 → Mar 1 2026 = 59 calendar days × 86400s (no +86399 offset —
      // calendar-day arithmetic is exact, see getDurationFromPickerDate).
      expect(result).toBe(59 * 86400)
    })

    it('keeps the exact contract year for date mode year presets', () => {
      const baseDate = plainDate('2026-09-08')
      const presetTimestamp =
        new Date(2026, 8, 8).getTime() + CONTRACT_SECONDS_PER_YEAR * 1000

      const result = getRenewalDurationSeconds({
        spanType: 'date',
        duration: presetTimestamp,
        baseDate,
      })

      // Not 365 × 86400 — the preset's 6h tail is preserved so the per-year
      // price row and the total agree.
      expect(result).toBe(CONTRACT_SECONDS_PER_YEAR)
    })

    it('keeps calendar picks on whole days across a DST transition', () => {
      // Nov 2026 → Mar 2027 spans the US fall-back and spring-forward; an epoch
      // delta would come out an hour short or long of the picked interval.
      const baseDate = plainDate('2026-11-01')
      const result = getRenewalDurationSeconds({
        spanType: 'date',
        duration: new Date(2027, 2, 15).getTime(),
        baseDate,
      })

      expect(result).toBe(
        baseDate.until(plainDate('2027-03-15'), { largestUnit: 'day' }).days *
          86400,
      )
    })

    it('measures each name from its own expiry towards a shared target date', () => {
      const target = new Date(2029, 0, 1).getTime()
      const durations = [plainDate('2026-01-01'), plainDate('2027-01-01')].map(
        (baseDate) =>
          getRenewalDurationSeconds({
            spanType: 'date',
            duration: target,
            baseDate,
          }),
      )

      // Same target, so the earlier-expiring name buys exactly a year more.
      expect(durations).toEqual([1096 * 86400, 731 * 86400])
    })

    it('falls back to the 28-day minimum for a name already expiring past the target', () => {
      // Multi-name date mode shares one target across the basket, so a name
      // that already outlives it has no span to buy. It gets the contract
      // minimum instead — the UI has no way to shorten an expiry, so such a
      // name is renewed 28 days past its own expiry, not "until" the target.
      const result = getRenewalDurationSeconds({
        spanType: 'date',
        duration: new Date(2030, 0, 1).getTime(),
        baseDate: plainDate('2040-01-01'),
      })

      expect(result).toBe(MIN_REGISTRATION_DURATION)
    })

    it('throws for invalid date mode duration', () => {
      expect(() =>
        getRenewalDurationSeconds({
          spanType: 'date',
          duration: Number.NaN,
          baseDate: plainDate('2026-01-01'),
        }),
      ).toThrow('Date mode duration must be a valid timestamp')
    })
  })
})
