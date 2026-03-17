export const SECONDS_PER_DAY = 24 * 60 * 60
export const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY
/** Minimum registration duration (matches v3 app: 28 days) */
export const MIN_REGISTRATION_DURATION = 28 * SECONDS_PER_DAY
/** Maximum registration duration in years (prevents Date overflow) */
export const MAX_REGISTRATION_YEARS = 1000
