import {
  type GraceProtocol,
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { ExpiryStageId } from '#types/events/index.js'

export type ExpiryStageConfig = {
  readonly id: ExpiryStageId
  /** Days relative to expiry. Positive is before; negative is after. */
  readonly offsetDays: number
  readonly includeFavorites: boolean
  /** Whether the stage is timed from the registrar expiry or the grace end. */
  readonly anchor: 'expiry' | 'grace-end'
  /** Whether released names belong here, notified at their last holder. */
  readonly includeReleased: boolean
}

/**
 * Grace-end stages keep their offsets and cursors in ENSv2 terms: a name sits
 * at its grace end minus ENSv2's grace, which for ENSv2 is its expiry and for
 * ENSv1 is 62 days after it.
 */
export const GRACE_END_SHIFT_SECONDS: Readonly<Record<GraceProtocol, number>> =
  {
    v2: 0,
    v1: (V1_GRACE_PERIOD_DAYS - V2_GRACE_PERIOD_DAYS) * SECONDS_PER_DAY,
  }

const STAGE_DEFINITIONS: readonly ExpiryStageConfig[] = [
  {
    id: 'expiry-30d',
    offsetDays: 30,
    includeFavorites: false,
    anchor: 'expiry',
    includeReleased: false,
  },
  {
    id: 'expiry-7d',
    offsetDays: 7,
    includeFavorites: true,
    anchor: 'expiry',
    includeReleased: false,
  },
  {
    id: 'expiry-1d',
    offsetDays: 1,
    includeFavorites: true,
    anchor: 'expiry',
    includeReleased: false,
  },
  {
    id: 'grace-start',
    offsetDays: 0,
    includeFavorites: true,
    anchor: 'expiry',
    includeReleased: false,
  },
  {
    id: 'grace-7d',
    offsetDays: -(V2_GRACE_PERIOD_DAYS - 7),
    includeFavorites: true,
    anchor: 'grace-end',
    includeReleased: false,
  },
  {
    id: 'grace-1d',
    offsetDays: -(V2_GRACE_PERIOD_DAYS - 1),
    includeFavorites: true,
    anchor: 'grace-end',
    includeReleased: false,
  },
  {
    id: 'premium-start',
    offsetDays: -V2_GRACE_PERIOD_DAYS,
    includeFavorites: true,
    anchor: 'grace-end',
    includeReleased: true,
  },
]

/** Lifecycle order is furthest-future to furthest-past. */
export const STAGES: readonly ExpiryStageConfig[] = [...STAGE_DEFINITIONS].sort(
  (left, right) => right.offsetDays - left.offsetDays,
)

export const MAX_STAGE_CATCH_UP_SECONDS = 2 * SECONDS_PER_DAY

export function getUpperBoundForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
) {
  return nowSec + stage.offsetDays * SECONDS_PER_DAY
}

export function getCloserStage(
  stage: ExpiryStageConfig,
  stages: readonly ExpiryStageConfig[] = STAGES,
): ExpiryStageConfig | undefined {
  let closer: ExpiryStageConfig | undefined

  for (const candidate of stages) {
    if (candidate.offsetDays >= stage.offsetDays) continue
    if (!closer || candidate.offsetDays > closer.offsetDays) closer = candidate
  }

  return closer
}

export function getLowerBoundForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
  stages: readonly ExpiryStageConfig[] = STAGES,
): number {
  const closerStage = getCloserStage(stage, stages)
  if (closerStage) return getUpperBoundForStage(closerStage, nowSec)
  return getUpperBoundForStage(stage, nowSec) - MAX_STAGE_CATCH_UP_SECONDS
}

export function getQueryCursorForStage(
  stage: ExpiryStageConfig,
  cursor: number,
  nowSec: number,
  stages: readonly ExpiryStageConfig[] = STAGES,
): number {
  return Math.max(cursor, getLowerBoundForStage(stage, nowSec, stages))
}

export function getDefaultCursorForStage(
  stage: ExpiryStageConfig,
  nowSec: number,
): number {
  return Math.min(nowSec, getUpperBoundForStage(stage, nowSec))
}

export function getExpiryStageRank(stageId: ExpiryStageId): number {
  return STAGES.findIndex((stage) => stage.id === stageId)
}
