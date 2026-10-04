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
  isNotifiableAtStage,
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

  describe('isNotifiableAtStage', () => {
    const held = ['active', 'wrapped', 'registered'] as const
    const lapsed = ['released', 'unregistered'] as const

    it.each([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
    ] as const)('keeps only held names before expiry (%s)', (id) => {
      for (const status of held) {
        expect(isNotifiableAtStage(getStage(id), status)).toBe(true)
      }
      for (const status of lapsed) {
        expect(isNotifiableAtStage(getStage(id), status)).toBe(false)
      }
    })

    it('keeps held ENSv1 leases and lapsed ENSv2 registrations at grace start', () => {
      for (const status of [...held, ...lapsed]) {
        expect(isNotifiableAtStage(getStage('grace-start'), status)).toBe(true)
      }
    })

    it.each([
      'grace-7d',
      'grace-1d',
      'premium-start',
    ] as const)('keeps only lapsed ENSv2 registrations late in grace (%s)', (id) => {
      for (const status of held) {
        expect(isNotifiableAtStage(getStage(id), status)).toBe(false)
      }
      for (const status of lapsed) {
        expect(isNotifiableAtStage(getStage(id), status)).toBe(true)
      }
    })

    it('keeps rows without a status at every stage', () => {
      for (const stage of STAGES) {
        expect(isNotifiableAtStage(stage, undefined)).toBe(true)
      }
    })
  })
})
