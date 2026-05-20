import { match, P } from 'ts-pattern'

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

export const isInGracePeriod = (
  expiryDate: Date | null | undefined,
  isV2: boolean,
  now: Date = new Date(),
): boolean => {
  const date = normalizeExpiryDate(expiryDate)
  return match(date)
    .with(P.nullish, () => false)
    .when((value) => now <= value, () => false)
    .otherwise((value) => now < getGraceEndDate(value, isV2))
}

/** V2 .eth 2LD: renew allowed until grace ends (portal `isExtendable2LD` for ENSv2). */
export const isRenewableV2EthName = (
  name: string,
  expiryDate: Date | null | undefined,
  now: Date = new Date(),
): boolean => {
  const date = normalizeExpiryDate(expiryDate)
  return match({ name, date })
    .with({ name: P.when((value) => !/^[^.]+\.eth$/.test(value)) }, () => false)
    .with(
      { date: P.not(P.nullish) },
      ({ date: value }) => getGraceEndDate(value, true).getTime() > now.getTime(),
    )
    .otherwise(() => false)
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
  const date = normalizeExpiryDate(expiryDate)
  return match(date)
    .with(P.nullish, () => false)
    .when((value) => isInGracePeriod(value, isV2, now), () => true)
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
  const date = normalizeExpiryDate(expiryDate)
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
  const date = normalizeExpiryDate(expiryDate)
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
