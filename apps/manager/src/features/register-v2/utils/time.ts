import type { Duration } from 'date-fns'
import {
  addYears,
  differenceInCalendarDays,
  differenceInCalendarYears,
  isSameDay,
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

export const getCalendarYearDurationYears = (
  duration: number,
  referenceDate: Date = new Date(),
) => {
  const normalizedReferenceDate = getStartOfDay(referenceDate)
  const expiryDate = new Date(referenceDate.getTime() + duration * 1000)
  const normalizedExpiryDate = getStartOfDay(expiryDate)
  const calendarYears = differenceInCalendarYears(
    normalizedExpiryDate,
    normalizedReferenceDate,
  )

  if (calendarYears < 1) {
    return null
  }

  const expectedExpiryDate = addYears(normalizedReferenceDate, calendarYears)

  if (!isSameDay(normalizedExpiryDate, expectedExpiryDate)) {
    return null
  }

  return calendarYears
}

export type DurationDisplayParts = {
  readonly years: number
  readonly months: number
  readonly weeks: number
  readonly days: number
}

export const getDurationDisplayParts = (
  duration: number,
  referenceDate: Date = new Date(),
) => {
  const canonicalYears =
    getCanonicalDurationYears(duration, referenceDate) ??
    getCalendarYearDurationYears(duration, referenceDate)

  if (canonicalYears) {
    return {
      years: canonicalYears,
      months: 0,
      weeks: 0,
      days: 0,
    } satisfies DurationDisplayParts
  }

  const parsedDuration = secondsToDuration(duration)

  return {
    years: parsedDuration.years ?? 0,
    months: parsedDuration.months ?? 0,
    weeks: parsedDuration.weeks ?? 0,
    days: parsedDuration.days ?? 0,
  } satisfies DurationDisplayParts
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
