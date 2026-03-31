import type { Temporal as TemporalType } from '@js-temporal/polyfill'
import { ensureTemporal } from '@/lib/temporal-shim'

export { Temporal } from '@js-temporal/polyfill'

type TemporalLike = typeof TemporalType

// Keep Temporal lazy-loading behavior active for all utils consumers.
void ensureTemporal()

const getTemporalIfAvailable = (): TemporalLike | null =>
  (globalThis as typeof globalThis & { Temporal?: TemporalLike }).Temporal ??
  null

/**
 * Returns epoch milliseconds using Temporal when available.
 * Falls back to Date.now while the polyfill is still loading.
 */
export const getNowEpochMilliseconds = (): number =>
  (() => {
    const temporal = getTemporalIfAvailable()
    return temporal ? temporal.Now.instant().epochMilliseconds : Date.now()
  })()

/**
 * Converts epoch milliseconds to Date, using Temporal as the source of truth
 * when it is available.
 */
export const dateFromEpochMilliseconds = (epochMilliseconds: number): Date =>
  (() => {
    const temporal = getTemporalIfAvailable()
    return temporal
      ? new Date(
          temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
            .epochMilliseconds,
        )
      : new Date(epochMilliseconds)
  })()

/**
 * Converts a Date into epoch milliseconds, preferring Temporal semantics.
 */
export const epochMillisecondsFromDate = (date: Date): number =>
  (() => {
    const temporal = getTemporalIfAvailable()
    return temporal
      ? temporal.Instant.fromEpochMilliseconds(date.valueOf()).epochMilliseconds
      : date.valueOf()
  })()
