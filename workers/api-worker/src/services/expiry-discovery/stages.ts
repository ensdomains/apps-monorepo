import type { RegistrationStatus } from '@ens-apps/indexer/bigname'
import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { ExpiryStageId } from '#types/events/index.js'

export type ExpiryStageConfig = {
  readonly id: ExpiryStageId
  /** Days relative to expiry. Positive is before; negative is after. */
  readonly offsetDays: number
  readonly includeFavorites: boolean
  /** Where the stage sits in a registration's lifecycle. */
  readonly phase: 'pre-expiry' | 'in-grace' | 'grace-ended'
}

// After the cutover, .eth registrations and premigration reservations share
// the served expiry and the 28-day grace, so every offset is from that expiry.

const STAGE_DEFINITIONS: readonly ExpiryStageConfig[] = [
  {
    id: 'expiry-30d',
    offsetDays: 30,
    includeFavorites: false,
    phase: 'pre-expiry',
  },
  {
    id: 'expiry-7d',
    offsetDays: 7,
    includeFavorites: true,
    phase: 'pre-expiry',
  },
  {
    id: 'expiry-1d',
    offsetDays: 1,
    includeFavorites: true,
    phase: 'pre-expiry',
  },
  {
    id: 'grace-start',
    offsetDays: 0,
    includeFavorites: true,
    phase: 'in-grace',
  },
  {
    id: 'grace-7d',
    offsetDays: -(V2_GRACE_PERIOD_DAYS - 7),
    includeFavorites: true,
    phase: 'in-grace',
  },
  {
    id: 'grace-1d',
    offsetDays: -(V2_GRACE_PERIOD_DAYS - 1),
    includeFavorites: true,
    phase: 'in-grace',
  },
  {
    id: 'premium-start',
    offsetDays: -V2_GRACE_PERIOD_DAYS,
    includeFavorites: true,
    phase: 'grace-ended',
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

const HELD_STATUSES: ReadonlySet<RegistrationStatus> = new Set([
  'active',
  'wrapped',
  'registered',
])

export type StageCandidate = {
  readonly registrationStatus: RegistrationStatus
  readonly releaseKind?: string
}

/**
 * Whether a row in this stage's window should be notified, from what the row
 * shows (bigname expiry-sweep guide, section 3). Before expiry only held names
 * are; in grace, an ENSv1 lease is still held while an ENSv2 registration is
 * served `released` as `expired`, and both are; after grace only rows released
 * because they expired. Any other release, and `unregistered`, never is.
 */
export function isNotifiableAtStage(
  stage: ExpiryStageConfig,
  candidate: StageCandidate,
): boolean {
  const isHeld = HELD_STATUSES.has(candidate.registrationStatus)
  const isExpiredRelease =
    candidate.registrationStatus === 'released' &&
    candidate.releaseKind === 'expired'
  switch (stage.phase) {
    case 'pre-expiry':
      return isHeld
    case 'in-grace':
      return isHeld || isExpiredRelease
    case 'grace-ended':
      return isExpiredRelease
  }
}
