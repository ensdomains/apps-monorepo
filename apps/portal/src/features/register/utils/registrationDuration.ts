import { Temporal } from '@js-temporal/polyfill'
import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
} from '@/lib/constants/duration'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'

function toPlainDate(date: Date): Temporal.PlainDate {
  // Use the local calendar date (local wall-clock), not UTC.
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  })
}

function comparePlainDate(
  a: Temporal.PlainDate,
  b: Temporal.PlainDate,
): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

export function isDateWithinCalendarRange(
  date: Date,
  minDate: Date,
  maxDate: Date,
): boolean {
  const plainToCheck = toPlainDate(date)
  const plainMin = toPlainDate(minDate)
  const plainMax = toPlainDate(maxDate)
  return (
    comparePlainDate(plainToCheck, plainMin) >= 0 &&
    comparePlainDate(plainToCheck, plainMax) <= 0
  )
}

function fromPlainDate(
  plain: Temporal.PlainDate,
  timeSource: Date,
  options?: { endOfDay?: boolean },
): Date {
  if (options?.endOfDay) {
    return new Date(plain.year, plain.month - 1, plain.day, 23, 59, 59, 999)
  }

  return new Date(
    plain.year,
    plain.month - 1,
    plain.day,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  )
}

function startOfDayLocal(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

function endOfDayLocal(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  )
}

function addCalendarDays(date: Date, days: number): Date {
  const plain = toPlainDate(date)
  const next = plain.add({ days })
  return fromPlainDate(next, date)
}

function addCalendarMonths(date: Date, months: number): Date {
  const plain = toPlainDate(date)
  const next = plain.add({ months })
  return fromPlainDate(next, date)
}

function addCalendarYears(date: Date, years: number): Date {
  const plain = toPlainDate(date)
  const next = plain.add({ years })
  return fromPlainDate(next, date)
}

function differenceInYears(endDate: Date, startDate: Date): number {
  const startPlain = toPlainDate(startDate)
  const endPlain = toPlainDate(endDate)

  const years = endPlain.year - startPlain.year
  const candidate = startPlain.add({ years })
  return comparePlainDate(candidate, endPlain) > 0 ? years - 1 : years
}

function differenceInMonths(endDate: Date, startDate: Date): number {
  const startPlain = toPlainDate(startDate)
  const endPlain = toPlainDate(endDate)

  const months =
    (endPlain.year - startPlain.year) * 12 + (endPlain.month - startPlain.month)
  const candidate = startPlain.add({ months })
  return comparePlainDate(candidate, endPlain) > 0 ? months - 1 : months
}

function differenceInDays(endDate: Date, startDate: Date): number {
  const startPlain = toPlainDate(startDate)
  const endPlain = toPlainDate(endDate)
  // After removing whole years+months, this should be an integer day difference.
  const duration = startPlain.until(endPlain, { largestUnit: 'days' })
  return duration.days
}

/**
 * Formats the duration from today to an expiry date as a human-readable string.
 * e.g. "1 year", "2 years 3 months", "6 months 15 days"
 */
export const formatRegistrationDuration = (
  startDate: Date,
  expiryDate: Date,
): string => {
  if (expiryDate.getTime() <= startDate.getTime()) {
    throw new Error('Expiry date must be after start date')
  }

  const years = differenceInYears(expiryDate, startDate)
  const afterYears = addCalendarYears(startDate, years)
  const months = differenceInMonths(expiryDate, afterYears)
  const afterMonths = addCalendarMonths(afterYears, months)
  const days = differenceInDays(expiryDate, afterMonths)

  const parts: string[] = []
  if (years > 0) {
    parts.push(years === 1 ? '1 year' : `${years} years`)
  }

  if (months > 0) {
    parts.push(months === 1 ? '1 month' : `${months} months`)
  }

  if (days > 0) {
    parts.push(days === 1 ? '1 day' : `${days} days`)
  }

  if (parts.length === 0) {
    const yearsOnly = differenceInYears(expiryDate, startDate)
    if (Number.isFinite(yearsOnly) && yearsOnly > 0) {
      return yearsOnly === 1 ? '1 year' : `${yearsOnly} years`
    }
    throw new Error('Duration is less than 1 day')
  }

  return parts.join(' ')
}

/**
 * Calculates the duration in years from today to a target date.
 * Returns years rounded to two decimal places (e.g. 1.00, 3.00, 2.50).
 */
export const calculateDurationFromDate = (
  startDate: Date,
  expiryDate: Date,
): number => {
  const diffMs = expiryDate.getTime() - startDate.getTime()

  if (diffMs <= 0) {
    return 1
  }

  const diffYears = diffMs / (CONTRACT_SECONDS_PER_YEAR * 1000)
  return Math.round(diffYears * 100) / 100
}

/**
 * Converts an expiry date to duration in seconds for ENS price/registration.
 * Uses actual calendar difference (includes leap years).
 * Minimum 28 days (matches v3 app Pricing.tsx minSeconds).
 */
export const getRegistrationDurationInSeconds = (
  startDate: Date,
  expiryDate: Date,
): number => {
  const diffMs = expiryDate.getTime() - startDate.getTime()
  if (diffMs <= 0) {
    return MIN_REGISTRATION_DURATION
  }
  const seconds = Math.floor(diffMs / 1000)
  return Math.max(seconds, MIN_REGISTRATION_DURATION)
}

/**
 * Converts duration in years to seconds using calendar-year addition (same
 * month/day, adjusted for leap years).
 * 3 years from Jan 1 2026 = Jan 1 2029 exactly, including leap years.
 */
export const getDurationInSecondsFromYears = (
  years: number,
  startOfToday: Date = getStartOfToday(),
): number => {
  const cappedYears = Math.min(
    Math.max(1, Math.floor(years)),
    MAX_REGISTRATION_YEARS,
  )
  const expiry = addCalendarYears(startOfToday, cappedYears)
  return Math.floor((expiry.getTime() - startOfToday.getTime()) / 1000)
}

/**
 * Returns the calendar years for a duration (for years picker display).
 */
export const getYearsFromDuration = (
  durationInSeconds: number,
  startOfToday: Date = getStartOfToday(),
): number => {
  const expiry = getRegistrationExpiryDateFromSeconds(
    startOfToday,
    durationInSeconds,
  )
  return differenceInYears(expiry, startOfToday)
}

/**
 * Converts duration in seconds to an expiry Date for display.
 * Use when storing duration in state and need a Date for formatting.
 */
export const getRegistrationExpiryDateFromSeconds = (
  startDate: Date,
  durationInSeconds: number,
): Date => {
  const expiryDate = new Date(startDate.getTime() + durationInSeconds * 1000)

  if (expiryDate.getTime() <= startDate.getTime()) {
    throw new Error('Expiry date must be after start date')
  }

  return expiryDate
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
 * Returns the start of today (00:00:00.000) as a Date.
 * Use as the canonical reference date for registration duration calculations.
 * Pass `now` for deterministic testing.
 */
export const getStartOfToday = (now: Date = new Date()): Date =>
  startOfDayLocal(now)

/**
 * Returns the minimum expiry date for the date picker (28 days from today).
 * Matches v3 app minSeconds = 28 * ONE_DAY; dates before this should be disabled.
 */
export const getMinExpiryDateForPicker = (
  startOfToday: Date = getStartOfToday(),
): Date => addCalendarDays(startOfToday, 28)

/**
 * Returns the maximum expiry date for the date picker (MAX_REGISTRATION_YEARS from today).
 */
export const getMaxExpiryDateForPicker = (
  startOfToday: Date = getStartOfToday(),
): Date => addCalendarYears(startOfToday, MAX_REGISTRATION_YEARS)

/**
 * Converts duration (seconds) to expiry Date for the date picker.
 * Returns end of the expiry day for consistent picker behavior.
 * Pass `startOfToday` for deterministic testing.
 */
export const getExpiryDateForPicker = (
  durationInSeconds: number,
  startOfToday: Date = getStartOfToday(),
): Date =>
  endOfDayLocal(
    getRegistrationExpiryDateFromSeconds(startOfToday, durationInSeconds),
  )

/**
 * Converts a date picker selection to duration (seconds).
 * Treats the selected date as end of that day.
 * Pass `startOfToday` for deterministic testing.
 */
export const getDurationFromPickerDate = (
  date: Date,
  startOfToday: Date = getStartOfToday(),
): number => {
  const maxExpiry = getMaxExpiryDateForPicker(startOfToday)
  const cappedDate =
    endOfDayLocal(date).getTime() > maxExpiry.getTime()
      ? maxExpiry
      : endOfDayLocal(date)
  return getRegistrationDurationInSeconds(startOfToday, cappedDate)
}
