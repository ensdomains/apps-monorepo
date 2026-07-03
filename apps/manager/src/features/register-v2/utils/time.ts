import type { Duration } from 'date-fns'
import {
  addYears,
  differenceInCalendarDays,
  formatDuration as formatDateFnsDuration,
  startOfDay,
} from 'date-fns'
import {
  secondsInDay,
  secondsInHour,
  secondsInMinute,
  secondsInMonth,
  secondsInWeek,
} from 'date-fns/constants'

/**
 * Days in a year.
 * `date-fns` uses 365.2425 days in a year but the contracts use 365.25 days so we need to use this constant instead.
 */
export const DAYS_IN_YEAR = 365.25

export const SECONDS_IN_YEAR = DAYS_IN_YEAR * secondsInDay
export const MAX_DURATION_YEARS = 100

const clampDurationYears = (years: number) =>
  Math.min(Math.max(1, Math.floor(years)), MAX_DURATION_YEARS)

export const getStartOfDay = (referenceDate: Date = new Date()) =>
  startOfDay(referenceDate)

export const getDurationInSecondsFromYears = (
  years: number,
  referenceDate: Date = new Date(),
) => {
  const normalizedReferenceDate = getStartOfDay(referenceDate)
  const normalizedYears = clampDurationYears(years)
  const thresholdDuration = normalizedYears * SECONDS_IN_YEAR
  const calendarDuration =
    differenceInCalendarDays(
      addYears(normalizedReferenceDate, normalizedYears),
      normalizedReferenceDate,
    ) * secondsInDay

  return Math.max(thresholdDuration, calendarDuration)
}

export const getCanonicalDurationYears = (
  duration: number,
  referenceDate: Date = new Date(),
) => {
  const normalizedDuration = Math.round(duration)
  const candidateYears = clampDurationYears(duration / SECONDS_IN_YEAR)

  if (
    getDurationInSecondsFromYears(candidateYears, referenceDate) !==
    normalizedDuration
  ) {
    return null
  }

  return candidateYears
}

export const formatDurationSecondsForDisplay = (
  duration: number,
  referenceDate: Date = new Date(),
) => {
  const canonicalYears = getCanonicalDurationYears(duration, referenceDate)

  if (canonicalYears) {
    return canonicalYears === 1
      ? '1 year'
      : `${canonicalYears.toString()} years`
  }

  return formatDateFnsDuration(secondsToDuration(duration), {
    format: ['years', 'months', 'weeks', 'days'],
  })
}

export const getDurationExpiryDateForDisplay = (
  duration: number,
  referenceDate: Date = new Date(),
) => {
  const canonicalYears = getCanonicalDurationYears(duration, referenceDate)

  if (canonicalYears) {
    return addYears(getStartOfDay(referenceDate), canonicalYears)
  }

  return new Date(referenceDate.getTime() + duration * 1000)
}

export const durationToSeconds = ({
  years,
  months,
  weeks,
  days,
  hours,
  minutes,
  seconds,
}: Duration) => {
  let totalDays = 0

  if (years) totalDays += years * DAYS_IN_YEAR
  if (months) totalDays += months * (DAYS_IN_YEAR / 12)
  if (weeks) totalDays += weeks * 7
  if (days) totalDays += days

  let totalSeconds = totalDays * 24 * 60 * 60

  if (hours) totalSeconds += hours * 60 * 60
  if (minutes) totalSeconds += minutes * 60
  if (seconds) totalSeconds += seconds

  return totalSeconds
}

export const secondsToDuration = (seconds: number): Duration => {
  let remainder = seconds

  const years = Math.floor(remainder / SECONDS_IN_YEAR)
  remainder -= years * SECONDS_IN_YEAR

  const months = Math.floor(remainder / secondsInMonth)
  remainder -= months * secondsInMonth

  const weeks = Math.floor(remainder / secondsInWeek)
  remainder -= weeks * secondsInWeek

  const days = Math.floor(remainder / secondsInDay)
  remainder -= days * secondsInDay

  const hours = Math.floor(remainder / secondsInHour)
  remainder -= hours * secondsInHour

  const minutes = Math.floor(remainder / secondsInMinute)
  remainder -= minutes * secondsInMinute

  return {
    years,
    months,
    weeks,
    days,
    hours,
    minutes,
    seconds: remainder,
  }
}
