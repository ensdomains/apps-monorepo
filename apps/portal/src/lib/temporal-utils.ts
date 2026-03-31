import type { Temporal as TemporalType } from '@js-temporal/polyfill'
import { getTemporal } from '@/lib/temporal-shim'

type TemporalLike = typeof TemporalType
export type TemporalPlainDate = TemporalType.PlainDate
export const Temporal = getTemporal()

const temporal = (): TemporalLike => getTemporal()

/**
 * Returns epoch milliseconds using Temporal when available.
 * Falls back to Date.now while the polyfill is still loading.
 */
export const getNowEpochMilliseconds = (): number =>
  temporal().Now.instant().epochMilliseconds

/**
 * Converts epoch milliseconds to Date, using Temporal as the source of truth
 * when it is available.
 */
export const dateFromEpochMilliseconds = (epochMilliseconds: number): Date =>
  new Date(
    temporal().Instant.fromEpochMilliseconds(epochMilliseconds)
      .epochMilliseconds,
  )

/**
 * Converts a Date into epoch milliseconds, preferring Temporal semantics.
 */
export const epochMillisecondsFromDate = (date: Date): number =>
  temporal().Instant.fromEpochMilliseconds(date.valueOf()).epochMilliseconds
