import * as v from 'valibot'
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
export const durationSearchSchema = v.pipe(
  v.object({
    durationDays: v.optional(
      integerSearchValue(MIN_DURATION_DAYS, MAX_DURATION_DAYS),
    ),
    durationYears: v.optional(integerSearchValue(1, MAX_DURATION_YEARS)),
  }),
  v.check(
    ({ durationDays, durationYears }) =>
      durationDays === undefined || durationYears === undefined,
    'Specify either days or years for the duration.',
  ),
)

export type DurationSearch = v.InferOutput<typeof durationSearchSchema>

export const getDurationPrefillSeconds = (
  { durationDays, durationYears }: DurationSearch,
  referenceDate: Date = new Date(),
): number | undefined => {
  if (durationDays !== undefined) return durationDays * SECONDS_PER_DAY
  if (durationYears !== undefined) {
    return getDurationInSecondsFromYears(durationYears, referenceDate)
  }
  return undefined
}
