import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import {
  getDefaultCursorForStage,
  getExpiryStageRank,
  getLowerBoundForStage,
  getQueryCursorForStage,
  getUpperBoundForStage,
  MAX_STAGE_CATCH_UP_SECONDS,
  STAGES,
} from './stages.js'

const DAY = 86_400

describe('expiry stages', () => {
  it('contains all lifecycle stage ids and favorite flags', () => {
    expect(STAGES.map((stage) => stage.id)).toEqual([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
      'grace-start',
      'grace-7d',
      'grace-1d',
      'premium-start',
    ])

    const byId = new Map(STAGES.map((stage) => [stage.id, stage]))
    expect(byId.get('expiry-30d')?.includeFavorites).toBe(false)
    expect(byId.get('expiry-7d')?.includeFavorites).toBe(true)
    expect(byId.get('expiry-1d')?.includeFavorites).toBe(true)
    expect(byId.get('grace-start')?.includeFavorites).toBe(true)
    expect(byId.get('grace-7d')?.includeFavorites).toBe(true)
    expect(byId.get('grace-1d')?.includeFavorites).toBe(true)
    expect(byId.get('premium-start')?.includeFavorites).toBe(true)
  })

  it('derives v2 grace offsets from the 28-day grace period', () => {
    const byId = new Map(STAGES.map((stage) => [stage.id, stage]))

    expect(byId.get('grace-start')?.offsetDays).toBe(0)
    expect(byId.get('grace-7d')?.offsetDays).toBe(-(V2_GRACE_PERIOD_DAYS - 7))
    expect(byId.get('grace-1d')?.offsetDays).toBe(-(V2_GRACE_PERIOD_DAYS - 1))
    expect(byId.get('premium-start')?.offsetDays).toBe(-V2_GRACE_PERIOD_DAYS)
  })

  it('computes upper bounds from protocol + expiryDate offsets', () => {
    const nowSec = 1_700_000_000
    const byId = new Map(STAGES.map((stage) => [stage.id, stage]))

    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('grace-start')!, nowSec)).toBe(nowSec)
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('expiry-1d')!, nowSec)).toBe(
      nowSec + DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('expiry-7d')!, nowSec)).toBe(
      nowSec + 7 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('expiry-30d')!, nowSec)).toBe(
      nowSec + 30 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('grace-7d')!, nowSec)).toBe(
      nowSec - 21 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('grace-1d')!, nowSec)).toBe(
      nowSec - 27 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getUpperBoundForStage(byId.get('premium-start')!, nowSec)).toBe(
      nowSec - 28 * DAY,
    )
  })

  it('defaults at/after-expiry cursors to the current window so history is not backfilled', () => {
    const nowSec = 1_700_000_000
    const byId = new Map(STAGES.map((stage) => [stage.id, stage]))

    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getDefaultCursorForStage(byId.get('expiry-30d')!, nowSec)).toBe(
      nowSec,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getDefaultCursorForStage(byId.get('grace-start')!, nowSec)).toBe(
      nowSec,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getDefaultCursorForStage(byId.get('grace-7d')!, nowSec)).toBe(
      nowSec - 21 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getDefaultCursorForStage(byId.get('premium-start')!, nowSec)).toBe(
      nowSec - 28 * DAY,
    )
  })

  it('uses exclusive windows so lagged cursors cannot overlap stages', () => {
    const nowSec = 1_700_000_000
    const byId = new Map(STAGES.map((stage) => [stage.id, stage]))

    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('expiry-30d')!, nowSec)).toBe(
      nowSec + 7 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('expiry-7d')!, nowSec)).toBe(
      nowSec + DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('expiry-1d')!, nowSec)).toBe(nowSec)
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('grace-start')!, nowSec)).toBe(
      nowSec - 21 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('grace-7d')!, nowSec)).toBe(
      nowSec - 27 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('grace-1d')!, nowSec)).toBe(
      nowSec - 28 * DAY,
    )
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    expect(getLowerBoundForStage(byId.get('premium-start')!, nowSec)).toBe(
      nowSec - 28 * DAY - MAX_STAGE_CATCH_UP_SECONDS,
    )
  })

  it('clamps lagged cursors up to the exclusive window without lowering a caught-up cursor', () => {
    const nowSec = 1_700_000_000
    const byId = new Map(STAGES.map((stage) => [stage.id, stage]))
    // biome-ignore lint/style/noNonNullAssertion: test assertion - stage IDs are known constants
    const expiry30d = byId.get('expiry-30d')!

    expect(getQueryCursorForStage(expiry30d, nowSec - 200 * DAY, nowSec)).toBe(
      nowSec + 7 * DAY,
    )
    expect(getQueryCursorForStage(expiry30d, nowSec + 10 * DAY, nowSec)).toBe(
      nowSec + 10 * DAY,
    )
    expect(getQueryCursorForStage(expiry30d, nowSec + 31 * DAY, nowSec)).toBe(
      nowSec + 31 * DAY,
    )
  })

  it('ranks lifecycle stages from furthest-future to furthest-past', () => {
    expect(getExpiryStageRank('expiry-30d')).toBeLessThan(
      getExpiryStageRank('expiry-7d'),
    )
    expect(getExpiryStageRank('grace-start')).toBeLessThan(
      getExpiryStageRank('premium-start'),
    )
  })
})
