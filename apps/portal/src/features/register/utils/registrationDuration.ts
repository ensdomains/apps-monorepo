import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
} from '@/lib/constants/duration'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { plainDateToDate } from '@/utils/temporal'

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

/**
 * Breaks a duration in seconds into {years, months, days} using the same
 * convention as the manager app (and the contract): 1 year = 365.25 d,
 * 1 month = year / 12. Pure seconds math, no Temporal calendar arithmetic.
 *
 * Matches manager's `secondsToDuration` so both apps format the same way.
 */
const SECONDS_PER_MONTH = CONTRACT_SECONDS_PER_YEAR / 12

const secondsToDuration = (seconds: number) => {
  let remainder = seconds
  const years = Math.floor(remainder / CONTRACT_SECONDS_PER_YEAR)
  remainder -= years * CONTRACT_SECONDS_PER_YEAR
  const months = Math.floor(remainder / SECONDS_PER_MONTH)
  remainder -= months * SECONDS_PER_MONTH
  const days = Math.floor(remainder / 86400)
  return { years, months, days }
}

/**
 * Formats a duration in seconds as a human-readable string.
 * e.g. "1 year", "2 years 3 months", "6 months 15 days"
 *
 * Uses contract-aligned 365.25 d/y math (via `secondsToDuration`), so
 * `N × CONTRACT_SECONDS_PER_YEAR` always renders as exactly "N years" —
 * no leap-year calendar drift surfacing as "6 years 11 months 30 days".
 */
export const formatRegistrationDuration = (durationSeconds: number): string => {
  const { years, months, days } = secondsToDuration(durationSeconds)

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
 * Calculates the duration in years from start to expiry.
 * Returns years rounded to two decimal places (e.g. 1.00, 3.00, 2.50).
 */
export const calculateDurationFromDate = (
  startDate: Temporal.PlainDate,
  expiryDate: Temporal.PlainDate,
): number => {
  const diffDays = startDate.until(expiryDate, { largestUnit: 'days' }).days

  if (diffDays <= 0) {
    return 1
  }

  const diffYears = diffDays / (CONTRACT_SECONDS_PER_YEAR / 86400)
  return Math.round(diffYears * 100) / 100
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
 * Converts a year count to seconds as `years × CONTRACT_SECONDS_PER_YEAR`
 * (365.25 days/year), matching the oracle's annualised rate. `years` is
 * floored to an integer and clamped to `[1, MAX_REGISTRATION_YEARS]`.
 */
export const getDurationInSecondsFromYears = (
  years: number,
  _startOfToday: Temporal.PlainDate = getStartOfToday(),
): number => {
  const cappedYears = Math.min(
    Math.max(1, Math.floor(years)),
    MAX_REGISTRATION_YEARS,
  )
  return cappedYears * CONTRACT_SECONDS_PER_YEAR
}

/**
 * Returns the year count for a duration, rounded to the nearest integer.
 * Inverse of `getDurationInSecondsFromYears` — round-trips cleanly so the
 * years picker keeps the user's selection regardless of start date.
 */
export const getYearsFromDuration = (
  durationInSeconds: number,
  _startOfToday: Temporal.PlainDate = getStartOfToday(),
): number => Math.round(durationInSeconds / CONTRACT_SECONDS_PER_YEAR)

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
    registrationPeriod: formatRegistrationDuration(durationSeconds),
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

/**
 * Converts a Temporal.PlainDate to a native Date for react-day-picker props.
 * Re-exported here for convenience in the date picker component.
 */
export { plainDateToDate }
