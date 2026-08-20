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

export function getUpperBoundForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
) {
  return nowSec + stage.offsetDays * SECONDS_PER_DAY
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
