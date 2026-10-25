import {
  GRACE_PERIOD_DAYS,
  getGraceEndDate,
  MS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { match, P } from 'ts-pattern'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'

export { GRACE_PERIOD_DAYS, getGraceEndDate, MS_PER_DAY, V2_GRACE_PERIOD_DAYS }

const normalizeExpiryDate = (
  expiryDate: Date | null | undefined,
): Date | null =>
  expiryDate != null && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null

export const isInGracePeriod = (
  expiryDate: Date | null | undefined,
  protocol: RenewalProtocol,
  now: Date = new Date(),
): boolean => {
  const date = normalizeExpiryDate(expiryDate)
  return match(date)
    .with(P.nullish, () => false)
    .when(
      (value) => now <= value,
      () => false,
    )
    .otherwise((value) => now < getGraceEndDate(value, protocol))
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
      ({ date: value }) =>
        getGraceEndDate(value, 'v2').getTime() > now.getTime(),
    )
    .otherwise(() => false)
}

export const isPastGracePeriod = (
  expiryDate: Date | null | undefined,
  protocol: RenewalProtocol,
  now: Date = new Date(),
): boolean => {
  const date = normalizeExpiryDate(expiryDate)
  return match(date)
    .with(P.nullish, () => false)
    .otherwise((value) => now >= getGraceEndDate(value, protocol))
}

export const getDaysSinceExpiry = (
  expiryDate: Date,
  now: Date = new Date(),
): number =>
  Math.max(0, Math.ceil((now.getTime() - expiryDate.getTime()) / MS_PER_DAY))

export const getDisplayExpiryDate = (
  expiryDate: Date | null | undefined,
  protocol: RenewalProtocol,
  now: Date = new Date(),
): Date | null => {
  const date = normalizeExpiryDate(expiryDate)
  return match(date)
    .with(P.nullish, () => null)
    .when(
      (value) => isInGracePeriod(value, protocol, now),
      (value) => getGraceEndDate(value, protocol),
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

/** A parent-issued subname has no registrar, so no grace window after expiry. */
export const getSubnameExpiryStatus = (
  expiryDate: Date | null | undefined,
  now: Date = new Date(),
): NameExpiryStatus => {
  const date = normalizeExpiryDate(expiryDate)

  return {
    expiryDate: date,
    isInGrace: false,
    graceEndDate: null,
    daysSinceExpiry: null,
    displayExpiryDate: date,
    isPastGrace: !!date && now >= date,
  }
}

/** Grace as bigname serves it; a name with none, such as a subname, has a null end. */
export const getServedExpiryStatus = (
  expiryDate: Date | null | undefined,
  graceEndDate: Date | null | undefined,
  now: Date = new Date(),
): NameExpiryStatus => {
  const date = normalizeExpiryDate(expiryDate)
  const graceEnd = normalizeExpiryDate(graceEndDate)
  const isInGrace = !!date && !!graceEnd && now > date && now < graceEnd

  return {
    expiryDate: date,
    isInGrace,
    graceEndDate: isInGrace ? graceEnd : null,
    daysSinceExpiry: date && isInGrace ? getDaysSinceExpiry(date, now) : null,
    displayExpiryDate: isInGrace ? graceEnd : date,
    isPastGrace: !!date && now >= (graceEnd ?? date),
  }
}

export const getNameExpiryStatus = (
  expiryDate: Date | null | undefined,
  protocol: RenewalProtocol,
  now: Date = new Date(),
): NameExpiryStatus => {
  const date = normalizeExpiryDate(expiryDate)
  const inGrace = date ? isInGracePeriod(date, protocol, now) : false

  return {
    expiryDate: date,
    isInGrace: inGrace,
    graceEndDate: date && inGrace ? getGraceEndDate(date, protocol) : null,
    daysSinceExpiry: date && inGrace ? getDaysSinceExpiry(date, now) : null,
    displayExpiryDate: getDisplayExpiryDate(date, protocol, now),
    isPastGrace: isPastGracePeriod(date, protocol, now),
  }
}
