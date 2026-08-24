import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { ExpiryStageId } from '#types/events/index.js'

export type ExpiryStageConfig = {
  id: ExpiryStageId
  /**
   * Days relative to `expiryDate` for the indexer window.
   * Positive = before expiry, zero = at expiry, negative = after expiry.
   *
   * v2 lifecycle:
   *   graceStart = expiryDate
   *   graceEnd   = expiryDate + 28d
   * so grace-7d/grace-1d/premium-start use negative expiryDate offsets.
   */
  offsetDays: number
  includeFavorites: boolean
}

export const STAGES: ExpiryStageConfig[] = [
  {
    id: 'expiry-30d',
    offsetDays: 30,
    includeFavorites: false,
  },
  {
    id: 'expiry-7d',
    offsetDays: 7,
    includeFavorites: true,
  },
  {
    id: 'expiry-1d',
    offsetDays: 1,
    includeFavorites: true,
  },
  {
    id: 'grace-start',
    offsetDays: 0,
    includeFavorites: true,
  },
  {
    id: 'grace-7d',
    offsetDays: -(V2_GRACE_PERIOD_DAYS - 7),
    includeFavorites: true,
  },
  {
    id: 'grace-1d',
    offsetDays: -(V2_GRACE_PERIOD_DAYS - 1),
    includeFavorites: true,
  },
  {
    id: 'premium-start',
    offsetDays: -V2_GRACE_PERIOD_DAYS,
    includeFavorites: true,
  },
]

/**
 * Premium-start has no closer stage, so catch-up is capped. Without this, a
 * lagged cursor would notify every name that already left grace.
 */
export const MAX_STAGE_CATCH_UP_SECONDS = 2 * SECONDS_PER_DAY

export function getUpperBoundForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
) {
  return nowSec + stage.offsetDays * SECONDS_PER_DAY
}

/**
 * Exclusive lower bound for this stage's window: the next closer stage's upper
 * bound. A name therefore belongs to at most one stage per cron run, even when
 * cursors have lagged across multiple lifecycle thresholds.
 */
export function getLowerBoundForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
) {
  const stageIndex = STAGES.findIndex((candidate) => candidate.id === stage.id)
  const closerStage = stageIndex >= 0 ? STAGES[stageIndex + 1] : undefined
  if (closerStage) {
    return getUpperBoundForStage(closerStage, nowSec)
  }

  return getUpperBoundForStage(stage, nowSec) - MAX_STAGE_CATCH_UP_SECONDS
}

export function getQueryCursorForStage(
  stage: ExpiryStageConfig,
  cursor: number,
  nowSec: number,
) {
  return Math.max(cursor, getLowerBoundForStage(stage, nowSec))
}

export function getExpiryStageRank(stageId: ExpiryStageId): number {
  return STAGES.findIndex((stage) => stage.id === stageId)
}

/**
 * Pre-expiry stages default to `now` so the first run backfills the upcoming
 * window. At/after-expiry stages default to the current upper bound so we do
 * not notify about names that already passed that lifecycle moment.
 */
export function getDefaultCursorForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
) {
  return Math.min(nowSec, getUpperBoundForStage(stage, nowSec))
}
