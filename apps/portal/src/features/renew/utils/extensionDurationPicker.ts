import {
  getDurationInSecondsFromYears,
  getStartOfToday,
} from '@/features/register/utils/registrationDuration'
import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
  SECONDS_PER_DAY,
} from '@/lib/constants/duration'
import { dateToPlainDate, plainDateToDate } from '@/utils/temporal'
import type { ExtensionSpanType } from '../components/ExtensionDurationOrExpiryPicker'

export const getExtensionBaseDate = (
  expiryDate?: Date | null,
): Temporal.PlainDate =>
  expiryDate ? dateToPlainDate(expiryDate) : getStartOfToday()

const getPlainDateFromTimestamp = (timestampMs: number): Temporal.PlainDate =>
  Temporal.Instant.fromEpochMilliseconds(timestampMs)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate()

export const getExtensionTargetDate = ({
  baseDate,
  duration,
  spanType,
}: {
  baseDate: Temporal.PlainDate
  duration: number
  spanType: ExtensionSpanType
}): Temporal.PlainDate => {
  if (spanType === 'years') {
    return baseDate.add({ years: Math.max(1, Math.round(duration)) })
  }

  if (!Number.isFinite(duration)) {
    throw new Error('Date mode duration must be a valid timestamp')
  }

  return getPlainDateFromTimestamp(duration)
}

export const getExtensionDisplayedYears = ({
  baseDate,
  duration,
  spanType,
  targetDate,
}: {
  baseDate: Temporal.PlainDate
  duration: number
  spanType: ExtensionSpanType
  targetDate: Temporal.PlainDate
}): number =>
  Math.min(
    MAX_REGISTRATION_YEARS,
    Math.max(
      1,
      Math.floor(
        spanType === 'years'
          ? duration
          : baseDate.until(targetDate, { largestUnit: 'years' }).years,
      ),
    ),
  )

/**
 * Date-mode timestamp for `years` years past `baseDate`, using the same duration
 * years mode would charge. Going through `add({ years })` instead drops the
 * 6h/yr a contract year carries over a calendar one, pricing "1 year" as
 * 11 months 30 days.
 *
 * Built with wall-clock arithmetic (whole days + seconds-of-day), never
 * `baseDate + duration * 1000`: `getRenewalDurationSeconds` decodes this
 * timestamp the same wall-clock way, so an epoch delta would lose an hour
 * across a DST transition and drop the preset just below the contract's
 * `CONTRACT_SECONDS_PER_YEAR * N` discount tier.
 */
export const getExtensionTimestampForYears = (
  baseDate: Temporal.PlainDate,
  years: number,
): number => {
  const seconds = getDurationInSecondsFromYears(years, baseDate)

  return baseDate
    .add({ days: Math.floor(seconds / SECONDS_PER_DAY) })
    .toZonedDateTime({
      timeZone: Temporal.Now.timeZoneId(),
      plainTime: Temporal.PlainTime.from('00:00').add({
        seconds: seconds % SECONDS_PER_DAY,
      }),
    }).epochMilliseconds
}

/**
 * Date-mode timestamp for a date picked off the calendar. A calendar day is
 * plain local midnight — except when it lands exactly on a whole-year target,
 * where it snaps to the preset duration instead. Encoding midnight there would
 * drop the 6h/yr tail and reprice the user's own "6 years" chip selection as
 * "5 years 11 months 29 days" the moment they re-picked that same day.
 */
export const getExtensionTimestampForPickedDate = (
  baseDate: Temporal.PlainDate,
  date: Temporal.PlainDate,
): number => {
  const days = baseDate.until(date, { largestUnit: 'day' }).days
  const years = Math.round((days * SECONDS_PER_DAY) / CONTRACT_SECONDS_PER_YEAR)
  const isWholeYearTarget =
    years >= 1 &&
    years <= MAX_REGISTRATION_YEARS &&
    Temporal.PlainDate.compare(baseDate.add({ years }), date) === 0

  return isWholeYearTarget
    ? getExtensionTimestampForYears(baseDate, years)
    : plainDateToDate(date).getTime()
}

export const getExtensionDurationForToggledSpan = ({
  baseDate,
  displayedYears,
  spanType,
}: {
  baseDate: Temporal.PlainDate
  displayedYears: number
  spanType: ExtensionSpanType
}): number =>
  spanType === 'years'
    ? getExtensionTimestampForYears(baseDate, displayedYears)
    : displayedYears
