import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import { MAX_REGISTRATION_YEARS } from '@/lib/constants/duration'
import { dateToPlainDate } from '@/utils/temporal'
import { getRenewalDurationSeconds } from '../hooks/useMultiNamePricing'
import {
  getExtensionBaseDate,
  getExtensionDisplayedYears,
  getExtensionDurationForToggledSpan,
  getExtensionTargetDate,
  getExtensionTimestampForPickedDate,
  getExtensionTimestampForYears,
} from './extensionDurationPicker'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extensionDurationPicker helpers', () => {
  it('returns expiry date as the base date when provided', () => {
    expect(
      // Local-midnight Date: `getExtensionBaseDate` reads the local calendar
      // day, so a UTC literal here would assert a different day west of UTC.
      getExtensionBaseDate(new Date(2026, 4, 10)).toString(),
    ).toBe('2026-05-10')
  })

  it('derives target date from years mode', () => {
    const result = getExtensionTargetDate({
      baseDate: Temporal.PlainDate.from('2026-01-01'),
      duration: 2,
      spanType: 'years',
    })

    expect(result.toString()).toBe('2028-01-01')
  })

  it('derives target date from date mode timestamp', () => {
    const result = getExtensionTargetDate({
      baseDate: Temporal.PlainDate.from('2026-01-01'),
      duration: new Date(2026, 3, 15).getTime(),
      spanType: 'date',
    })

    expect(result.toString()).toBe('2026-04-15')
  })

  it('throws for invalid date mode duration', () => {
    expect(() =>
      getExtensionTargetDate({
        baseDate: Temporal.PlainDate.from('2026-01-01'),
        duration: Number.NaN,
        spanType: 'date',
      }),
    ).toThrow('Date mode duration must be a valid timestamp')
  })

  it('derives displayed years from date mode target date', () => {
    const result = getExtensionDisplayedYears({
      baseDate: Temporal.PlainDate.from('2026-01-01'),
      duration: new Date('2028-01-01T00:00:00.000Z').getTime(),
      spanType: 'date',
      targetDate: Temporal.PlainDate.from('2028-01-01'),
    })

    expect(result).toBe(2)
  })

  it('converts years mode toggle value to a date timestamp', () => {
    const result = getExtensionDurationForToggledSpan({
      baseDate: Temporal.PlainDate.from('2026-01-01'),
      displayedYears: 3,
      spanType: 'years',
    })

    expect(dateToPlainDate(new Date(result)).toString()).toBe('2029-01-01')
    // Same duration years mode would charge, so toggling modes doesn't reprice
    // the extension as 2 years 11 months 30 days.
    expect(result - new Date(2026, 0, 1).getTime()).toBe(
      getDurationInSecondsFromYears(3, Temporal.PlainDate.from('2026-01-01')) *
        1000,
    )
  })

  it.each([
    1, 2, 3, 5,
  ])('round-trips the %i year preset through date mode across a DST transition', (years) => {
    // Base sits days before US DST starts, so base and target land on
    // opposite sides of a clock change. An epoch-delta timestamp would decode
    // an hour short and miss the contract's whole-year discount tier.
    vi.spyOn(Temporal.Now, 'timeZoneId').mockReturnValue('America/New_York')
    const baseDate = Temporal.PlainDate.from('2025-03-10')

    const timestamp = getExtensionTimestampForYears(baseDate, years)

    expect(
      getRenewalDurationSeconds({
        spanType: 'date',
        duration: timestamp,
        baseDate,
      }),
    ).toBe(getDurationInSecondsFromYears(years, baseDate))
  })

  it('reprices a re-picked preset date as the same whole-year duration', () => {
    // Repro: pick "6 years" from the chips, pick some other day, then pick the
    // chip's day back off the calendar. Plain local midnight would come back
    // as "5 years 11 months 29 days" and lose the tier discount.
    const baseDate = Temporal.PlainDate.from('2028-08-06')
    const chipTimestamp = getExtensionTimestampForYears(baseDate, 6)
    const chipDate = getExtensionTargetDate({
      baseDate,
      duration: chipTimestamp,
      spanType: 'date',
    })

    expect(getExtensionTimestampForPickedDate(baseDate, chipDate)).toBe(
      chipTimestamp,
    )
  })

  it('keeps a calendar date that is not a whole-year target at local midnight', () => {
    const baseDate = Temporal.PlainDate.from('2028-08-06')
    const picked = Temporal.PlainDate.from('2029-02-14')

    expect(getExtensionTimestampForPickedDate(baseDate, picked)).toBe(
      new Date(2029, 1, 14).getTime(),
    )
  })

  it('snaps a leap-day expiry to the constrained whole-year target', () => {
    // Feb 29 + 1 year constrains to Feb 28, so the snap has to compare against
    // the constrained date or a leap-day name silently loses its preset.
    const baseDate = Temporal.PlainDate.from('2028-02-29')
    const chipTimestamp = getExtensionTimestampForYears(baseDate, 1)
    const chipDate = getExtensionTargetDate({
      baseDate,
      duration: chipTimestamp,
      spanType: 'date',
    })

    expect(chipDate.toString()).toBe('2029-02-28')
    expect(getExtensionTimestampForPickedDate(baseDate, chipDate)).toBe(
      chipTimestamp,
    )
    expect(
      getRenewalDurationSeconds({
        spanType: 'date',
        duration: chipTimestamp,
        baseDate,
      }),
    ).toBe(getDurationInSecondsFromYears(1, baseDate))
  })

  it.each([
    1, 3, 10,
  ])('preserves %i years across a years → date → years toggle', (years) => {
    const baseDate = Temporal.PlainDate.from('2030-06-15')

    const asDate = getExtensionDurationForToggledSpan({
      baseDate,
      displayedYears: years,
      spanType: 'years',
    })
    const backToYears = getExtensionDisplayedYears({
      baseDate,
      duration: asDate,
      spanType: 'date',
      targetDate: getExtensionTargetDate({
        baseDate,
        duration: asDate,
        spanType: 'date',
      }),
    })

    expect(backToYears).toBe(years)
  })

  it('clamps a years request beyond the registration maximum', () => {
    const baseDate = Temporal.PlainDate.from('2030-01-01')

    expect(
      getExtensionTargetDate({
        baseDate,
        duration: getExtensionTimestampForYears(
          baseDate,
          MAX_REGISTRATION_YEARS + 1,
        ),
        spanType: 'date',
      }).year,
    ).toBe(baseDate.add({ years: MAX_REGISTRATION_YEARS }).year)
  })

  it('converts date mode toggle value back to displayed years', () => {
    const result = getExtensionDurationForToggledSpan({
      baseDate: Temporal.PlainDate.from('2026-01-01'),
      displayedYears: 3,
      spanType: 'date',
    })

    expect(result).toBe(3)
  })
})
