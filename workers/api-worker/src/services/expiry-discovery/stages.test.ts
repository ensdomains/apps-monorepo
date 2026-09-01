import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import {
  type ExpiryStageConfig,
  getCloserStage,
  getDefaultCursorForStage,
  getExpiryStageRank,
  getLowerBoundForStage,
  getQueryCursorForStage,
  getUpperBoundForStage,
  MAX_STAGE_CATCH_UP_SECONDS,
  STAGES,
} from './stages.js'
import { getStage } from './test-helpers.js'

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

    expect(getStage('expiry-30d').includeFavorites).toBe(false)
    expect(getStage('expiry-7d').includeFavorites).toBe(true)
    expect(getStage('expiry-1d').includeFavorites).toBe(true)
    expect(getStage('grace-start').includeFavorites).toBe(true)
    expect(getStage('grace-7d').includeFavorites).toBe(true)
    expect(getStage('grace-1d').includeFavorites).toBe(true)
    expect(getStage('premium-start').includeFavorites).toBe(true)
  })

  it('orders stages by offsetDays from furthest-future to furthest-past', () => {
    const offsets = STAGES.map((stage) => stage.offsetDays)
    expect(offsets).toEqual([...offsets].sort((left, right) => right - left))
    expect(new Set(offsets).size).toBe(offsets.length)
    expect(offsets[0]).toBeGreaterThan(0)
    expect(offsets[offsets.length - 1]).toBeLessThan(0)
  })

  it('derives v2 grace offsets from the 28-day grace period', () => {
    expect(getStage('grace-start').offsetDays).toBe(0)
    expect(getStage('grace-7d').offsetDays).toBe(-(V2_GRACE_PERIOD_DAYS - 7))
    expect(getStage('grace-1d').offsetDays).toBe(-(V2_GRACE_PERIOD_DAYS - 1))
    expect(getStage('premium-start').offsetDays).toBe(-V2_GRACE_PERIOD_DAYS)
  })

  it('computes upper bounds from protocol + expiryDate offsets', () => {
    const nowSec = 1_700_000_000

    expect(getUpperBoundForStage(getStage('grace-start'), nowSec)).toBe(nowSec)
    expect(getUpperBoundForStage(getStage('expiry-1d'), nowSec)).toBe(
      nowSec + DAY,
    )
    expect(getUpperBoundForStage(getStage('expiry-7d'), nowSec)).toBe(
      nowSec + 7 * DAY,
    )
    expect(getUpperBoundForStage(getStage('expiry-30d'), nowSec)).toBe(
      nowSec + 30 * DAY,
    )
    expect(getUpperBoundForStage(getStage('grace-7d'), nowSec)).toBe(
      nowSec - 21 * DAY,
    )
    expect(getUpperBoundForStage(getStage('grace-1d'), nowSec)).toBe(
      nowSec - 27 * DAY,
    )
    expect(getUpperBoundForStage(getStage('premium-start'), nowSec)).toBe(
      nowSec - 28 * DAY,
    )
  })

  it('keeps every stage window upper bound >= its exclusive lower bound', () => {
    const nowSec = 1_700_000_000

    for (const stage of STAGES) {
      const lowerBound = getLowerBoundForStage(stage, nowSec)
      const upperBound = getUpperBoundForStage(stage, nowSec)
      expect(upperBound).toBeGreaterThanOrEqual(lowerBound)
      expect(upperBound - lowerBound).toBeGreaterThanOrEqual(0)
    }
  })

  it('defaults at/after-expiry cursors to the current window so history is not backfilled', () => {
    const nowSec = 1_700_000_000

    expect(getDefaultCursorForStage(getStage('expiry-30d'), nowSec)).toBe(
      nowSec,
    )
    expect(getDefaultCursorForStage(getStage('grace-start'), nowSec)).toBe(
      nowSec,
    )
    expect(getDefaultCursorForStage(getStage('grace-7d'), nowSec)).toBe(
      nowSec - 21 * DAY,
    )
    expect(getDefaultCursorForStage(getStage('premium-start'), nowSec)).toBe(
      nowSec - 28 * DAY,
    )
  })

  it('uses exclusive windows so lagged cursors cannot overlap stages', () => {
    const nowSec = 1_700_000_000

    expect(getLowerBoundForStage(getStage('expiry-30d'), nowSec)).toBe(
      nowSec + 7 * DAY,
    )
    expect(getLowerBoundForStage(getStage('expiry-7d'), nowSec)).toBe(
      nowSec + DAY,
    )
    expect(getLowerBoundForStage(getStage('expiry-1d'), nowSec)).toBe(nowSec)
    expect(getLowerBoundForStage(getStage('grace-start'), nowSec)).toBe(
      nowSec - 21 * DAY,
    )
    expect(getLowerBoundForStage(getStage('grace-7d'), nowSec)).toBe(
      nowSec - 27 * DAY,
    )
    expect(getLowerBoundForStage(getStage('grace-1d'), nowSec)).toBe(
      nowSec - 28 * DAY,
    )
    expect(getLowerBoundForStage(getStage('premium-start'), nowSec)).toBe(
      nowSec - 28 * DAY - MAX_STAGE_CATCH_UP_SECONDS,
    )
  })

  it('selects the closer stage by offsetDays rather than array position', () => {
    const disordered: ExpiryStageConfig[] = [
      getStage('premium-start'),
      getStage('expiry-30d'),
      getStage('grace-start'),
      getStage('expiry-7d'),
    ]

    expect(getCloserStage(getStage('expiry-30d'), disordered)?.id).toBe(
      'expiry-7d',
    )
    expect(getCloserStage(getStage('grace-start'), disordered)?.id).toBe(
      'premium-start',
    )
    expect(
      getCloserStage(getStage('premium-start'), disordered),
    ).toBeUndefined()
  })

  it('does not invert windows when a negative-offset stage is inserted first', () => {
    const nowSec = 1_700_000_000
    const stages: ExpiryStageConfig[] = [
      {
        id: 'premium-start',
        offsetDays: -90,
        includeFavorites: true,
      },
      getStage('expiry-30d'),
      getStage('expiry-7d'),
    ]

    const expiry30d = getStage('expiry-30d')
    const lowerBound = getLowerBoundForStage(expiry30d, nowSec, stages)
    const upperBound = getUpperBoundForStage(expiry30d, nowSec)

    expect(upperBound).toBeGreaterThanOrEqual(lowerBound)
    expect(lowerBound).toBe(
      getUpperBoundForStage(getStage('expiry-7d'), nowSec),
    )

    const farPast = stages[0]
    if (!farPast) {
      throw new Error('Test setup error: expected a far-past stage')
    }
    const farPastLower = getLowerBoundForStage(farPast, nowSec, stages)
    const farPastUpper = getUpperBoundForStage(farPast, nowSec)
    expect(farPastUpper).toBeGreaterThanOrEqual(farPastLower)
    expect(farPastLower).toBe(farPastUpper - MAX_STAGE_CATCH_UP_SECONDS)
  })

  it('maintains expiry -> grace -> premium lifecycle order', () => {
    expect(getExpiryStageRank('expiry-30d')).toBeLessThan(
      getExpiryStageRank('expiry-7d'),
    )
    expect(getExpiryStageRank('expiry-7d')).toBeLessThan(
      getExpiryStageRank('expiry-1d'),
    )
    expect(getExpiryStageRank('expiry-1d')).toBeLessThan(
      getExpiryStageRank('grace-start'),
    )
    expect(getExpiryStageRank('grace-start')).toBeLessThan(
      getExpiryStageRank('grace-7d'),
    )
    expect(getExpiryStageRank('grace-7d')).toBeLessThan(
      getExpiryStageRank('grace-1d'),
    )
    expect(getExpiryStageRank('grace-1d')).toBeLessThan(
      getExpiryStageRank('premium-start'),
    )
  })

  it('clamps lagged cursors up to the exclusive window without lowering a caught-up cursor', () => {
    const nowSec = 1_700_000_000
    const expiry30d = getStage('expiry-30d')

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
