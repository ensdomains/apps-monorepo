import {
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  endOfDay,
} from 'date-fns'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'

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

  if (days > 0 && months === 0) {
    parts.push(days === 1 ? '1 day' : `${days} days`)
  }

  if (parts.length === 0) {
    throw new Error('Duration is less than 1 day')
  }

  return parts.join(' ')
}

/**
 * Calculates the duration in years from today to a target date.
 * Returns exact fractional years (e.g. 2.12) - no rounding for accurate pricing.
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
  return diffYears
}

/**
 * Converts an expiry date to duration in seconds for ENS price/registration.
 */
export const getRegistrationDurationInSeconds = (
  startDate: Date,
  expiryDate: Date,
): number => {
  const years = calculateDurationFromDate(startDate, expiryDate)
  return getDurationInSecondsFromYears(years)
}

/**
 * Converts duration in years to seconds for ENS price/registration.
 * Supports fractional years (e.g. 2.12) for exact date picker values.
 */
export const getDurationInSecondsFromYears = (years: number): number =>
  Math.floor(Math.max(1, years) * SECONDS_PER_YEAR)

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
 * Returns the end of today (23:59:59.999) as a Date.
 * Use as the canonical reference date for registration duration calculations.
 */
export const getEndOfToday = (): Date => endOfDay(new Date())
