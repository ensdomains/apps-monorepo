import type { Duration } from 'date-fns'
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
