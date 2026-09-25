import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import { describe, expect, it } from 'vitest'
import type { ExpiryStageId } from '#types/events/index.js'
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

const DAY = 86_400
const getStage = (id: ExpiryStageId): ExpiryStageConfig => {
  const stage = STAGES.find((candidate) => candidate.id === id)
  if (!stage) throw new Error(`Missing stage fixture: ${id}`)
  return stage
}

describe('expiry stages', () => {
  it('defines and orders the complete lifecycle', () => {
    expect(STAGES.map((stage) => stage.id)).toEqual([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
      'grace-start',
      'grace-7d',
      'grace-1d',
      'premium-start',
    ])
    expect(STAGES.map((stage) => stage.offsetDays)).toEqual([
      30,
      7,
      1,
      0,
      -(V2_GRACE_PERIOD_DAYS - 7),
      -(V2_GRACE_PERIOD_DAYS - 1),
      -V2_GRACE_PERIOD_DAYS,
    ])
    expect(getStage('expiry-30d').includeFavorites).toBe(false)
    expect(STAGES.slice(1).every((stage) => stage.includeFavorites)).toBe(true)
  })

  it('uses exclusive stage windows and a bounded final catch-up', () => {
    const now = 1_700_000_000
    expect(getLowerBoundForStage(getStage('expiry-30d'), now)).toBe(
      now + 7 * DAY,
    )
    expect(getLowerBoundForStage(getStage('expiry-7d'), now)).toBe(now + DAY)
    expect(getLowerBoundForStage(getStage('expiry-1d'), now)).toBe(now)
    expect(getLowerBoundForStage(getStage('grace-start'), now)).toBe(
      now - 21 * DAY,
    )
    expect(getLowerBoundForStage(getStage('grace-7d'), now)).toBe(
      now - 27 * DAY,
    )
    expect(getLowerBoundForStage(getStage('grace-1d'), now)).toBe(
      now - 28 * DAY,
    )
    const premiumUpper = getUpperBoundForStage(getStage('premium-start'), now)
    expect(getLowerBoundForStage(getStage('premium-start'), now)).toBe(
      premiumUpper - MAX_STAGE_CATCH_UP_SECONDS,
    )
  })

  it('finds closer stages by offset instead of array position', () => {
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
  })

  it('clamps stale cursors without moving in-window cursors', () => {
    const now = 1_700_000_000
    const stage = getStage('expiry-30d')
    expect(getQueryCursorForStage(stage, now - 200 * DAY, now)).toBe(
      now + 7 * DAY,
    )
    expect(getQueryCursorForStage(stage, now + 10 * DAY, now)).toBe(
      now + 10 * DAY,
    )
  })

  it('defaults post-expiry stages at their current boundaries', () => {
    const now = 1_700_000_000
    expect(getDefaultCursorForStage(getStage('expiry-30d'), now)).toBe(now)
    expect(getDefaultCursorForStage(getStage('grace-start'), now)).toBe(now)
    expect(getDefaultCursorForStage(getStage('grace-7d'), now)).toBe(
      now - 21 * DAY,
    )
    expect(getDefaultCursorForStage(getStage('premium-start'), now)).toBe(
      now - 28 * DAY,
    )
  })

  it('ranks stages from future to past', () => {
    expect(getExpiryStageRank('expiry-30d')).toBeLessThan(
      getExpiryStageRank('grace-start'),
    )
    expect(getExpiryStageRank('grace-start')).toBeLessThan(
      getExpiryStageRank('premium-start'),
    )
  })
})
