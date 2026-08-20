export const MS_PER_DAY = 24 * 60 * 60 * 1000
export const SECONDS_PER_DAY = 24 * 60 * 60

export const V1_GRACE_PERIOD_DAYS = 90
export const V2_GRACE_PERIOD_DAYS = 28
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
