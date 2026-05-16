import { match, P } from 'ts-pattern'
// REMOVE_BEFORE_GRACE_PR: delete `gracePeriodSimulation` import + `expiryDateForGraceCheck`;
// use `normalizeExpiryDate` for grace helpers; restore `getNameExpiryStatus` date = raw expiry only.
import {
  getSimulatedExpiryDate,
  isGracePeriodSimulationEnabled,
} from '@/features/grace/utils/gracePeriodSimulation'

export const MS_PER_DAY = 24 * 60 * 60 * 1000
export const GRACE_PERIOD_DAYS = 90
export const V2_GRACE_PERIOD_DAYS = 28
export const PROMINENT_RENEW_THRESHOLD_DAYS = 30

const graceDaysFor = (isV2: boolean): number =>
  match(isV2)
    .with(true, () => V2_GRACE_PERIOD_DAYS)
    .with(false, () => GRACE_PERIOD_DAYS)
    .exhaustive()

export const getGraceEndDate = (expiryDate: Date, isV2: boolean): Date =>
  new Date(expiryDate.getTime() + graceDaysFor(isV2) * MS_PER_DAY)

const normalizeExpiryDate = (
  expiryDate: Date | null | undefined,
): Date | null =>
  expiryDate != null && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null

/** REMOVE_BEFORE_GRACE_PR: remove this helper and use `normalizeExpiryDate(expiryDate)` below. */
const expiryDateForGraceCheck = (
  expiryDate: Date | null | undefined,
  now: Date,
): Date | null => {
  if (isGracePeriodSimulationEnabled()) {
    return getSimulatedExpiryDate(now)
  }
  return normalizeExpiryDate(expiryDate)
}

export const isInGracePeriod = (
  expiryDate: Date | null | undefined,
  isV2: boolean,
  now: Date = new Date(),
): boolean => {
  const date = expiryDateForGraceCheck(expiryDate, now)
  return match(date)
    .with(P.nullish, () => false)
    .when((value) => now <= value, () => false)
    .otherwise((value) => now < getGraceEndDate(value, isV2))
}

export const isPastGracePeriod = (
  expiryDate: Date | null | undefined,
  isV2: boolean,
  now: Date = new Date(),
): boolean => {
  const date = normalizeExpiryDate(expiryDate)
  return match(date)
    .with(P.nullish, () => false)
    .otherwise((value) => now >= getGraceEndDate(value, isV2))
}

export const getDaysSinceExpiry = (
  expiryDate: Date,
  now: Date = new Date(),
): number =>
  Math.max(0, Math.ceil((now.getTime() - expiryDate.getTime()) / MS_PER_DAY))

export const shouldShowProminentRenew = (
  expiryDate: Date | null | undefined,
  isV2: boolean,
  now: Date = new Date(),
): boolean => {
  const date = expiryDateForGraceCheck(expiryDate, now)
  return match(date)
    .with(P.nullish, () => false)
    .when(
      (value) => isInGracePeriod(value, isV2, now),
      () => true,
    )
    .otherwise((value) => {
      const daysUntil = Math.ceil(
        (value.getTime() - now.getTime()) / MS_PER_DAY,
      )
      return daysUntil > 0 && daysUntil <= PROMINENT_RENEW_THRESHOLD_DAYS
    })
}

export const getDisplayExpiryDate = (
  expiryDate: Date | null | undefined,
  isV2: boolean,
  now: Date = new Date(),
): Date | null => {
  const date = expiryDateForGraceCheck(expiryDate, now)
  return match(date)
    .with(P.nullish, () => null)
    .when(
      (value) => isInGracePeriod(value, isV2, now),
      (value) => getGraceEndDate(value, isV2),
    )
    .otherwise((value) => value)
}

export type NameExpiryStatus = {
  readonly expiryDate: Date | null
  readonly isInGrace: boolean
  readonly graceEndDate: Date | null
  readonly daysSinceExpiry: number | null
  readonly displayExpiryDate: Date | null
  readonly isPastGrace: boolean
}

export const getNameExpiryStatus = (
  expiryDate: Date | null | undefined,
  isV2: boolean,
  now: Date = new Date(),
): NameExpiryStatus => {
  const date = expiryDateForGraceCheck(expiryDate, now)
  const inGrace = date ? isInGracePeriod(date, isV2, now) : false

  return {
    expiryDate: date,
    isInGrace: inGrace,
    graceEndDate: date && inGrace ? getGraceEndDate(date, isV2) : null,
    daysSinceExpiry: date && inGrace ? getDaysSinceExpiry(date, now) : null,
    displayExpiryDate: getDisplayExpiryDate(date, isV2, now),
    isPastGrace: isPastGracePeriod(date, isV2, now),
  }
}
