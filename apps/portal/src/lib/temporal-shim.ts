import type { Temporal as TemporalType } from '@js-temporal/polyfill'

type TemporalLike = typeof TemporalType

type GlobalWithOptionalTemporal = typeof globalThis & {
  Temporal?: TemporalLike
}

let temporalLoadPromise: Promise<TemporalLike> | null = null
const globalWithTemporal = globalThis as GlobalWithOptionalTemporal

/**
 * Starts loading Temporal polyfill only when global Temporal is unavailable.
 * Safe to call multiple times.
 */
export const ensureTemporal = async (): Promise<TemporalLike> => {
  if (globalWithTemporal.Temporal) return globalWithTemporal.Temporal

  if (!temporalLoadPromise) {
    temporalLoadPromise = import('@js-temporal/polyfill').then(
      ({ Temporal }) => {
        if (!globalWithTemporal.Temporal) {
          globalWithTemporal.Temporal = Temporal
        }
        return globalWithTemporal.Temporal
      },
    )
  }

  return temporalLoadPromise
}

/**
 * Returns epoch milliseconds using Temporal when available.
 * Falls back to Date.now while the polyfill is still loading.
 */
export const getNowEpochMilliseconds = (): number =>
  globalWithTemporal.Temporal
    ? globalWithTemporal.Temporal.Now.instant().epochMilliseconds
    : Date.now()

// Trigger lazy loading in environments where Temporal is missing.
void ensureTemporal()
