import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
} from '@/lib/constants/duration'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'

/**
 * Returns true when `date` falls on or between `minDate` and `maxDate` (inclusive),
 * comparing calendar dates only (no time component).
 */
export function isDateWithinCalendarRange(
  date: Temporal.PlainDate,
  minDate: Temporal.PlainDate,
  maxDate: Temporal.PlainDate,
): boolean {
  return (
    Temporal.PlainDate.compare(date, minDate) >= 0 &&
    Temporal.PlainDate.compare(date, maxDate) <= 0
  )
}

const SECONDS_PER_MONTH = CONTRACT_SECONDS_PER_YEAR / 12

/**
 * Formats a duration in seconds as "X years Y months Z days" using the
 * contract's year definition (1 year = CONTRACT_SECONDS_PER_YEAR = 365.25 d,
 * 1 month = year / 12). Same `secondsToDuration` pattern manager uses, so
 * `N × CONTRACT_SECONDS_PER_YEAR` renders cleanly as "N years" instead of
 * "N-1 years 11 months 30 days" (which the old Temporal calendar diff
 * produced after the floor in expiry display dropped the 0.25 d/y leap
 * fraction).
 */
export const formatRegistrationDuration = (durationSeconds: number): string => {
  let remainder = durationSeconds
  const years = Math.floor(remainder / CONTRACT_SECONDS_PER_YEAR)
  remainder -= years * CONTRACT_SECONDS_PER_YEAR
  const months = Math.floor(remainder / SECONDS_PER_MONTH)
  remainder -= months * SECONDS_PER_MONTH
  const days = Math.floor(remainder / 86400)

  const parts: string[] = []
  if (years > 0) parts.push(years === 1 ? '1 year' : `${years} years`)
  if (months > 0) parts.push(months === 1 ? '1 month' : `${months} months`)
  if (days > 0) parts.push(days === 1 ? '1 day' : `${days} days`)

  if (parts.length === 0) {
    throw new Error('Duration is less than 1 day')
  }

  return parts.join(' ')
}

/**
 * Formats the calendar span between two dates as "X years Y months Z days".
 *
 * Use instead of `formatRegistrationDuration` whenever a base date is known
 * (the extend flow): seconds ÷ 365.25 d absorbs up to 23h of slack per year, so
 * a span one day past a whole-year target renders identically to the target
 * itself (366 days and the 365.25-day "1 year" preset both print "1 year").
 * A calendar diff off the base date says "1 year 1 day", which is what the user
 * picked.
 */
export const formatCalendarDuration = (
  startDate: Temporal.PlainDate,
  endDate: Temporal.PlainDate,
): string => {
  const { years, months, days } = startDate.until(endDate, {
    largestUnit: 'year',
  })

  // A Feb 29 start constrains to Feb 28 a year later, which `until` reports as
  // "11 months 30 days". That IS the whole-year target for such a name, so say
  // so rather than shaving a day off the user's "1 year".
  const constrainedYears = years + 1
  if (
    (months > 0 || days > 0) &&
    Temporal.PlainDate.compare(
      startDate.add({ years: constrainedYears }),
      endDate,
    ) === 0
  ) {
    return `${constrainedYears} year${constrainedYears === 1 ? '' : 's'}`
  }

  const parts = [
    [years, 'year'],
    [months, 'month'],
    [days, 'day'],
  ] as const

  return (
    parts
      .filter(([value]) => value > 0)
      .map(([value, unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`)
      .join(' ') || '0 days'
  )
}

/**
 * Converts an expiry date to duration in seconds for ENS price/registration.
 * Uses actual calendar difference (whole days × 86400).
 * Minimum 28 days (matches v3 app Pricing.tsx minSeconds).
 */
export const getRegistrationDurationInSeconds = (
  startDate: Temporal.PlainDate,
  expiryDate: Temporal.PlainDate,
): number => {
  const diffDays = startDate.until(expiryDate, { largestUnit: 'days' }).days
  if (diffDays <= 0) {
    return MIN_REGISTRATION_DURATION
  }
  const seconds = diffDays * 86400
  return Math.max(seconds, MIN_REGISTRATION_DURATION)
}

/**
 * Year-picker → seconds: the LARGER of:
 *   - flat rack rate `N × CONTRACT_SECONDS_PER_YEAR` (365.25 d) — clears
 *     the contract's discount tier so 1y is always $8, 2y is always tier-
 *     priced, etc.
 *   - actual calendar days from today to `today + N calendar years` ×
 *     86400 — so when the interval contains a leap day, we pay for it and
 *     the expiry display lands on the calendar N-years-later date instead
 *     of half a day shy.
 *
 * Net: summary expiry matches on-chain expiry. For year spans that cross
 * Feb 29 you pay 1 cent extra (e.g. 2y from 2026-06-05 → $14.01) — the
 * honest cost of the extra leap day.
 */
export const getDurationInSecondsFromYears = (
  years: number,
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): number => {
  const N = Math.min(Math.max(1, Math.floor(years)), MAX_REGISTRATION_YEARS)
  const flatDuration = N * CONTRACT_SECONDS_PER_YEAR
  const calendarDuration =
    startOfToday.until(startOfToday.add({ years: N }), {
      largestUnit: 'days',
    }).days * 86400
  return Math.max(flatDuration, calendarDuration)
}

/**
 * Returns the year count for a duration, rounded to the nearest integer.
 * Inverse of `getDurationInSecondsFromYears` — round-trips cleanly so the
 * years picker keeps the user's selection regardless of start date.
 */
export const getYearsFromDuration = (durationInSeconds: number): number =>
  Math.round(durationInSeconds / CONTRACT_SECONDS_PER_YEAR)

/**
 * Converts duration in seconds to an expiry PlainDate for display.
 * Use when storing duration in state and need a PlainDate for formatting.
 */
export const getRegistrationExpiryDateFromSeconds = (
  startDate: Temporal.PlainDate,
  durationInSeconds: number,
): Temporal.PlainDate => {
  const days = Math.floor(durationInSeconds / 86400)
  const expiry = startDate.add({ days })

  if (Temporal.PlainDate.compare(expiry, startDate) <= 0) {
    throw new Error('Expiry date must be after start date')
  }

  return expiry
}

/**
 * Returns display values for a registration duration (period, expiry date, days).
 * Shared by checkout summary and success screens.
 *
 * Pass `baseDate` (default: today) to anchor the expiry on an existing date —
 * used by the extend flow so `expiresFormatted` reflects `currentExpiry + duration`.
 *
 * `registrationPeriod` is the calendar span base → expiry, so it always moves
 * with the expiry shown next to it. See `formatCalendarDuration`.
 */
export function getRegistrationDisplayDates(
  durationSeconds: number,
  baseDate: Temporal.PlainDate = getStartOfToday(),
) {
  const startOfToday = getStartOfToday()
  const expiryDate = getRegistrationExpiryDateFromSeconds(
    baseDate,
    durationSeconds,
  )
  const daysUntilExpiry = startOfToday.until(expiryDate, {
    largestUnit: 'days',
  }).days
  return {
    registrationPeriod: formatCalendarDuration(baseDate, expiryDate),
    registrationDays: Math.floor(durationSeconds / 86400),
    daysUntilExpiry,
    expiresFormatted: formatExpiryDate(expiryDate),
  }
}

/**
 * Returns today's date as a Temporal.PlainDate in the system's local calendar.
 * Use as the canonical reference for registration duration calculations.
 */
export const getStartOfToday = (): Temporal.PlainDate =>
  Temporal.Now.plainDateISO()

/**
 * Returns the minimum expiry date for the date picker (28 days from today).
 * Matches v3 app minSeconds = 28 * ONE_DAY; dates before this should be disabled.
 */
export const getMinExpiryDateForPicker = (
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): Temporal.PlainDate => startOfToday.add({ days: 28 })

/**
 * Returns the maximum expiry date for the date picker (MAX_REGISTRATION_YEARS from today).
 */
export const getMaxExpiryDateForPicker = (
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): Temporal.PlainDate => startOfToday.add({ years: MAX_REGISTRATION_YEARS })

/**
 * Converts duration (seconds) to expiry PlainDate for the date picker.
 * Pass `startOfToday` for deterministic testing.
 */
export const getExpiryDateForPicker = (
  durationInSeconds: number,
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): Temporal.PlainDate =>
  getRegistrationExpiryDateFromSeconds(startOfToday, durationInSeconds)

/**
 * Converts a date picker selection (PlainDate) to duration in seconds.
 * Uses calendar-day arithmetic via Temporal — `days` counts exact calendar
 * days, so `days * 86400` is the correct on-chain duration. No +86399 offset
 * is needed here (unlike timestamp-based approaches) because Temporal never
 * loses fractional-day rounding; the ENS registrar adds this duration to
 * block.timestamp, placing expiry at roughly the same time of day as
 * registration, which is within the user's chosen calendar day.
 * Pass `startOfToday` for deterministic testing.
 */
export const getDurationFromPickerDate = (
  date: Temporal.PlainDate,
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): number => {
  const maxExpiry = getMaxExpiryDateForPicker(startOfToday)
  const capped =
    Temporal.PlainDate.compare(date, maxExpiry) > 0 ? maxExpiry : date
  const days = startOfToday.until(capped, { largestUnit: 'days' }).days
  return Math.max(days * 86400, MIN_REGISTRATION_DURATION)
}
