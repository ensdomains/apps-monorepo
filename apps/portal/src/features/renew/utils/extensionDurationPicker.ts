import { match } from 'ts-pattern'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import {
  CONTRACT_SECONDS_PER_YEAR,
  MAX_REGISTRATION_YEARS,
  MIN_REGISTRATION_DURATION,
  SECONDS_PER_DAY,
} from '@/lib/constants/duration'

/**
 * What the user picked in the extend flow: a number of years, or the expiry
 * date they chose. Both stay in their own representation — no epoch timestamps,
 * so nothing has to survive a Date round trip.
 */
export type ExtensionSpan =
  | { readonly type: 'years'; readonly years: number }
  | { readonly type: 'date'; readonly date: Temporal.PlainDate }

const clampYears = (years: number): number =>
  Math.min(Math.max(1, Math.round(years)), MAX_REGISTRATION_YEARS)

export const getExtensionTargetDate = (
  baseDate: Temporal.PlainDate,
  span: ExtensionSpan,
): Temporal.PlainDate =>
  match(span)
    .with({ type: 'years' }, ({ years }) =>
      baseDate.add({ years: clampYears(years) }),
    )
    .with({ type: 'date' }, ({ date }) => date)
    .exhaustive()

export const getExtensionDisplayedYears = (
  baseDate: Temporal.PlainDate,
  span: ExtensionSpan,
): number =>
  match(span)
    .with({ type: 'years' }, ({ years }) => clampYears(years))
    .with({ type: 'date' }, ({ date }) =>
      Math.min(
        MAX_REGISTRATION_YEARS,
        Math.max(1, baseDate.until(date, { largestUnit: 'year' }).years),
      ),
    )
    .exhaustive()

/**
 * Seconds to charge for `span`, measured from `baseDate` (the name's expiry).
 *
 * A date that lands exactly on a whole-year target is priced as that many
 * contract years, not as the calendar days between: a contract year is 365.25 d,
 * so plain day-counting comes in ~6h/yr short and drops the term below the
 * oracle's discount tier.
 */
export const getExtensionDurationSeconds = (
  baseDate: Temporal.PlainDate,
  span: ExtensionSpan,
): number =>
  match(span)
    .with({ type: 'years' }, ({ years }) =>
      getDurationInSecondsFromYears(years, baseDate),
    )
    .with({ type: 'date' }, ({ date }) => {
      const days = baseDate.until(date, { largestUnit: 'day' }).days
      const years = clampYears(
        (days * SECONDS_PER_DAY) / CONTRACT_SECONDS_PER_YEAR,
      )

      return Temporal.PlainDate.compare(baseDate.add({ years }), date) === 0
        ? getDurationInSecondsFromYears(years, baseDate)
        : Math.max(days * SECONDS_PER_DAY, MIN_REGISTRATION_DURATION)
    })
    .exhaustive()

/** The same span expressed the other way, so toggling modes never reprices. */
export const getToggledExtensionSpan = (
  baseDate: Temporal.PlainDate,
  span: ExtensionSpan,
): ExtensionSpan =>
  match(span)
    .with(
      { type: 'years' },
      (years): ExtensionSpan => ({
        type: 'date',
        date: getExtensionTargetDate(baseDate, years),
      }),
    )
    .with(
      { type: 'date' },
      (date): ExtensionSpan => ({
        type: 'years',
        years: getExtensionDisplayedYears(baseDate, date),
      }),
    )
    .exhaustive()
