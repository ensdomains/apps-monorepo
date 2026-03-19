import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  endOfDay,
  startOfDay,
} from 'date-fns'
import {
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
  SECONDS_PER_YEAR,
} from '@/lib/constants/duration'
import { formatExpiryDate } from '@/utils/formatting/formatDateTime'

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
  const afterYears = addYears(startDate, years)
  const months = differenceInMonths(expiryDate, afterYears)
  const afterMonths = addMonths(afterYears, months)
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

  const diffYears = diffMs / (SECONDS_PER_YEAR * 1000)
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
 * Converts duration in years to seconds using calendar math (addYears).
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
  const expiry = addYears(startOfToday, cappedYears)
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
    startOfToday,
    expiryDate,
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
export const getStartOfToday = (now: Date = new Date()): Date => startOfDay(now)

/**
 * Returns the minimum expiry date for the date picker (28 days from today).
 * Matches v3 app minSeconds = 28 * ONE_DAY; dates before this should be disabled.
 */
export const getMinExpiryDateForPicker = (
  startOfToday: Date = getStartOfToday(),
): Date => addDays(startOfToday, 28)

/**
 * Returns the maximum expiry date for the date picker (MAX_REGISTRATION_YEARS from today).
 */
export const getMaxExpiryDateForPicker = (
  startOfToday: Date = getStartOfToday(),
): Date => addYears(startOfToday, MAX_REGISTRATION_YEARS)

/**
 * Converts duration (seconds) to expiry Date for the date picker.
 * Returns end of the expiry day for consistent picker behavior.
 * Pass `startOfToday` for deterministic testing.
 */
export const getExpiryDateForPicker = (
  durationInSeconds: number,
  startOfToday: Date = getStartOfToday(),
): Date =>
  endOfDay(
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
    endOfDay(date).getTime() > maxExpiry.getTime() ? maxExpiry : endOfDay(date)
  return getRegistrationDurationInSeconds(startOfToday, cappedDate)
}
