import type { Duration } from 'date-fns'
import {
  daysInYear,
  secondsInDay,
  secondsInHour,
  secondsInMinute,
  secondsInMonth,
  secondsInWeek,
  secondsInYear,
} from 'date-fns/constants'

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

  if (years) totalDays += years * daysInYear
  if (months) totalDays += months * (daysInYear / 12)
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

  const years = Math.floor(remainder / secondsInYear)
  remainder -= years * secondsInYear

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
