export const SECONDS_PER_MINUTE = 60
export const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR
/**
 * Seconds per year used by StandardRentPriceOracle. Must match contract deploy.
 * @see contracts-v2/contracts/deploy/02_StandardRentPriceOracle.ts
 */
export const CONTRACT_SECONDS_PER_YEAR = 31_557_600
/** Minimum registration duration (matches v3 app: 28 days) */
export const MIN_REGISTRATION_DURATION = 28 * SECONDS_PER_DAY
/** Renewing has no 28-day floor on either renewer; the picker is day-granular. */
export const MIN_RENEWAL_DURATION = SECONDS_PER_DAY
/** Maximum registration duration in years (prevents Date overflow) */
export const MAX_REGISTRATION_YEARS = 1000
