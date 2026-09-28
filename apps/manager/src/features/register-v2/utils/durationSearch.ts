import * as v from 'valibot'
import {
  getTargetDateRenewalDuration,
  parseTargetCalendarDate,
} from '@/features/renew/utils/targetDate'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/shared/registration/pricing'
import { getDurationInSecondsFromYears, MAX_DURATION_YEARS } from './time'

const integerSearchValue = (minimum: number, maximum: number) =>
  v.pipe(
    v.union([
      v.number(),
      v.pipe(
        v.string(),
        v.regex(/^\d+$/),
        v.transform((value) => Number(value)),
      ),
    ]),
    v.integer(),
    v.minValue(minimum),
    v.maxValue(maximum),
  )

const SECONDS_PER_DAY = 86_400
const MIN_DURATION_DAYS = MIN_REGISTER_DURATION_SECONDS / SECONDS_PER_DAY
const MAX_DURATION_DAYS = Math.ceil(MAX_DURATION_YEARS * 365.25)

/**
 * A duration is expressed in the unit the user chose. Years are resolved
 * against the on-chain expiry for renewal, so leap years do not shift the
 * requested renewal date.
 */
const createDurationSearchSchema = (
  minimumDays: number,
  allowTargetDate = false,
) =>
  v.pipe(
    v.object({
      durationDays: v.optional(
        integerSearchValue(minimumDays, MAX_DURATION_DAYS),
      ),
      durationYears: v.optional(integerSearchValue(1, MAX_DURATION_YEARS)),
      targetDate: v.optional(
        v.pipe(
          v.string(),
          v.check(
            (value) =>
              allowTargetDate && parseTargetCalendarDate(value) !== null,
            'Use a valid renewal target date.',
          ),
        ),
      ),
    }),
    v.check(
      ({ durationDays, durationYears, targetDate }) =>
        [durationDays, durationYears, targetDate].filter(
          (value) => value !== undefined,
        ).length <= 1,
      'Specify days, years, or one target renewal date.',
    ),
  )

export const durationSearchSchema =
  createDurationSearchSchema(MIN_DURATION_DAYS)
export const renewalDurationSearchSchema = createDurationSearchSchema(1, true)

export type DurationSearch = v.InferOutput<typeof durationSearchSchema>

export const getDurationPrefillSeconds = (
  { durationDays, durationYears, targetDate }: DurationSearch,
  referenceDate: Date = new Date(),
): number | undefined => {
  if (targetDate !== undefined) {
    const target = getTargetDateRenewalDuration(targetDate, referenceDate, 1)
    if (target.status === 'invalid') throw new Error(target.message)
    return target.seconds
  }
  if (durationDays !== undefined) return durationDays * SECONDS_PER_DAY
  if (durationYears !== undefined) {
    return getDurationInSecondsFromYears(durationYears, referenceDate)
  }
  return undefined
}
