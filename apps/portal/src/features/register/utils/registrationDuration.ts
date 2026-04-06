import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
} from '@/lib/constants/duration'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'
import { dateToplainDate, plainDateToDate } from '@/utils/temporal'

/**
 * Returns true when `date` falls on or between `minDate` and `maxDate` (inclusive),
 * comparing calendar dates only (no time component).
 *
 * Kept with a Date signature because react-day-picker's `disabled` callback
 * provides native Date objects.
 */
export function isDateWithinCalendarRange(
  date: Date,
  minDate: Date,
  maxDate: Date,
): boolean {
  const check = dateToplainDate(date)
  const min = dateToplainDate(minDate)
  const max = dateToplainDate(maxDate)
  return (
    Temporal.PlainDate.compare(check, min) >= 0 &&
    Temporal.PlainDate.compare(check, max) <= 0
  )
}

/**
 * Formats the duration from today to an expiry date as a human-readable string.
 * e.g. "1 year", "2 years 3 months", "6 months 15 days"
 */
export const formatRegistrationDuration = (
  startDate: Temporal.PlainDate,
  expiryDate: Temporal.PlainDate,
): string => {
  if (Temporal.PlainDate.compare(expiryDate, startDate) <= 0) {
    throw new Error('Expiry date must be after start date')
  }

  const { years, months, days } = startDate.until(expiryDate, {
    largestUnit: 'years',
  })

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
 * Converts duration in years to seconds using calendar-year addition (same
 * month/day, adjusted for leap years).
 * 3 years from Jan 1 2026 = Jan 1 2029 exactly, including leap years.
 */
export const getDurationInSecondsFromYears = (
  years: number,
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): number => {
  const cappedYears = Math.min(
    Math.max(1, Math.floor(years)),
    MAX_REGISTRATION_YEARS,
  )
  const expiry = startOfToday.add({ years: cappedYears })
  return startOfToday.until(expiry, { largestUnit: 'days' }).days * 86400
}

/**
 * Returns the calendar years for a duration (for years picker display).
 */
export const getYearsFromDuration = (
  durationInSeconds: number,
  startOfToday: Temporal.PlainDate = getStartOfToday(),
): number => {
  const expiry = getRegistrationExpiryDateFromSeconds(
    startOfToday,
    durationInSeconds,
  )
  return startOfToday.until(expiry, { largestUnit: 'years' }).years
}

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
 */
export function getRegistrationDisplayDates(durationSeconds: number) {
  const startOfToday = getStartOfToday()
  const expiryDate = getRegistrationExpiryDateFromSeconds(
    startOfToday,
    durationSeconds,
  )
  return {
    registrationPeriod: formatRegistrationDuration(startOfToday, expiryDate),
    registrationDays: Math.floor(durationSeconds / 86400),
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
 * Treats the selected date as end of that day (adds 86399 s for 23:59:59).
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
  // Include end-of-day offset (23:59:59) so the picker date round-trips correctly.
  return Math.max(days * 86400 + 86399, MIN_REGISTRATION_DURATION)
}

/**
 * Converts a Temporal.PlainDate to a native Date for react-day-picker props.
 * Re-exported here for convenience in the date picker component.
 */
export { plainDateToDate }
