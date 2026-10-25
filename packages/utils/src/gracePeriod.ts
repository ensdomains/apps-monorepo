export const MS_PER_DAY = 24 * 60 * 60 * 1000
export const SECONDS_PER_DAY = 24 * 60 * 60

export const V1_GRACE_PERIOD_DAYS = 90
export const V2_GRACE_PERIOD_DAYS = 28
/** BaseRegistrar still renews at expiry + 90 days; the name is available one second later. */
export const V1_RENEWAL_WINDOW_SECONDS =
  BigInt(V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY) + 1n
/** Alias for the v1 grace window; prefer `V1_GRACE_PERIOD_DAYS` in new code. */
export const GRACE_PERIOD_DAYS = V1_GRACE_PERIOD_DAYS

export type GraceProtocol = 'v1' | 'v2'

export const gracePeriodDaysFor = (protocol: GraceProtocol): number =>
  protocol === 'v2' ? V2_GRACE_PERIOD_DAYS : V1_GRACE_PERIOD_DAYS

export const getGraceEndDate = (
  expiryDate: Date,
  protocol: GraceProtocol,
): Date =>
  new Date(expiryDate.getTime() + gracePeriodDaysFor(protocol) * MS_PER_DAY)

export type NameLifecycleState = 'expiring' | 'grace' | 'premium'

export const getNameLifecycleState = (
  expiryDate: Date,
  protocol: GraceProtocol,
  now: Date = new Date(),
): NameLifecycleState => {
  const nowMs = now.getTime()
  if (nowMs < expiryDate.getTime()) return 'expiring'
  if (nowMs < getGraceEndDate(expiryDate, protocol).getTime()) return 'grace'
  return 'premium'
}

export const daysUntilDate = (target: Date, now: Date = new Date()): number =>
  Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY)
