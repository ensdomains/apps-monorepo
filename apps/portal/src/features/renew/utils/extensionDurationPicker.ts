import {
  getDurationInSecondsFromYears,
  getStartOfToday,
  plainDateToDate,
} from '@/features/register/utils/registrationDuration'
import { MAX_REGISTRATION_YEARS } from '@/lib/constants/duration'
import { dateToPlainDate } from '@/utils/temporal'
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
 */
export const getExtensionTimestampForYears = (
  baseDate: Temporal.PlainDate,
  years: number,
): number =>
  plainDateToDate(baseDate).getTime() +
  getDurationInSecondsFromYears(years, baseDate) * 1000

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
