import { startOfDay } from 'date-fns'
import { MAX_DURATION_YEARS } from '@/features/register-v2/utils/time'

/** Parse a calendar date in the user's local timezone, never as UTC midnight. */
export const parseTargetCalendarDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1000 || year > 9999) return null
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null
}

export const isFutureTargetDate = (
  value: unknown,
  now = new Date(),
): boolean => {
  const date = parseTargetCalendarDate(value)
  return (
    date !== null &&
    date.getTime() > startOfDay(now).getTime() &&
    date.getFullYear() <= now.getFullYear() + MAX_DURATION_YEARS
  )
}

/** The Worker does not know the browser timezone. UTC today can be tomorrow
 * for a client west of UTC; the native preparation checks its local date. */
export const isPotentialFutureTargetDate = (
  value: string,
  now = new Date(),
): boolean => {
  const date = parseTargetCalendarDate(value)
  return (
    date !== null &&
    value >= now.toISOString().slice(0, 10) &&
    date.getFullYear() <= now.getUTCFullYear() + MAX_DURATION_YEARS
  )
}

export const getTargetDateRenewalDuration = (
  targetDate: string,
  currentExpiry: Date,
  minimumDays: number,
  now = new Date(),
):
  | {
      readonly status: 'ready'
      readonly seconds: number
      readonly target: Date
    }
  | { readonly status: 'invalid'; readonly message: string } => {
  const target = parseTargetCalendarDate(targetDate)
  if (!target || !isFutureTargetDate(targetDate, now))
    return {
      status: 'invalid',
      message: 'Choose a valid future renewal date within 100 years.',
    }
  // The request supplies a day, not a clock time. End of that local day gives
  // every name the same actual expiry and respects DST without day rounding.
  target.setHours(23, 59, 59, 0)
  const seconds = Math.floor(
    (target.getTime() - currentExpiry.getTime()) / 1000,
  )
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < minimumDays * 86_400 ||
    seconds > Math.ceil(MAX_DURATION_YEARS * 365.25) * 86_400
  )
    return {
      status: 'invalid',
      message: `The target date must add at least ${minimumDays} full days to every selected name, within Manager's duration limit.`,
    }
  return { status: 'ready', seconds, target }
}
