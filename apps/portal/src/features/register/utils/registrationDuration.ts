import {
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
} from 'date-fns'
import { SECONDS_PER_YEAR } from '@/lib/constants/duration'

/**
 * Formats the duration from today to an expiry date as a human-readable string.
 * e.g. "1 year", "2 years 3 months", "6 months 15 days"
 */
export const formatRegistrationDuration = (expiryDate: Date): string => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(expiryDate)
  target.setHours(0, 0, 0, 0)

  if (target.getTime() <= today.getTime()) {
    return '1 year'
  }

  const years = differenceInYears(target, today)
  const afterYears = addYears(today, years)
  const months = differenceInMonths(target, afterYears)
  const afterMonths = addMonths(afterYears, months)
  const days = differenceInDays(target, afterMonths)

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

  return parts.length > 0 ? parts.join(' ') : '1 year'
}

/**
 * Calculates the duration in years from today to a target date.
 * Returns exact fractional years (e.g. 2.12) - no rounding for accurate pricing.
 */
export const calculateDurationFromDate = (targetDate: Date): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)

  const diffMs = target.getTime() - today.getTime()

  if (diffMs <= 0) {
    return 1
  }

  const diffYears = diffMs / (SECONDS_PER_YEAR * 1000)
  return diffYears
}

/**
 * Converts an expiry date to duration in seconds for ENS price/registration.
 */
export const getDurationInSeconds = (expiryDate: Date): number => {
  const years = calculateDurationFromDate(expiryDate)
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
export const getExpiryDateFromSeconds = (seconds: number): Date => {
  const date = new Date()
  date.setTime(date.getTime() + seconds * 1000)
  return date
}
