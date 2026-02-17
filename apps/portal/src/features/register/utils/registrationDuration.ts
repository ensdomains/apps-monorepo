import {
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
} from 'date-fns'

/**
 * Calculates the expiry date by adding years to today.
 */
export const calculateExpirationDate = (years: number): Date => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + years)
  return date
}

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
 * Calculates the duration in years from today to a target date, rounding up.
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

  const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000)
  const roundedYears = Math.ceil(diffYears)

  return Math.max(1, roundedYears)
}

/** Seconds in one year (365.25 days) - matches ENS duration calculation */
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60

/**
 * Converts an expiry date to duration in seconds for ENS price/registration.
 * Uses the same year length as calculateDurationFromDate.
 */
export const getDurationInSeconds = (expiryDate: Date): number => {
  const years = calculateDurationFromDate(expiryDate)
  return Math.floor(years * SECONDS_PER_YEAR)
}

/**
 * Converts duration in years to seconds for ENS price/registration.
 */
export const getDurationInSecondsFromYears = (years: number): number =>
  Math.floor(Math.max(1, years) * SECONDS_PER_YEAR)
