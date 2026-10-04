import type { RegistrationStatus } from '@ens-apps/bigname'
import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { ExpiryStageId } from '#types/events/index.js'

export type ExpiryStageConfig = {
  id: ExpiryStageId
  /** Days relative to expiry. Positive is before; negative is after. */
  offsetDays: number
  includeFavorites: boolean
}

const STAGE_DEFINITIONS: ExpiryStageConfig[] = [
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

/** Lifecycle order is furthest-future to furthest-past. */
export const STAGES: ExpiryStageConfig[] = [...STAGE_DEFINITIONS].sort(
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

/**
 * Whether a name listed in this stage's expiry window should be notified,
 * judged by bigname's `registration_status` (the expiry listing covers live,
 * in-grace and released registrations alike). Stage windows follow the ENSv2
 * lifecycle (`V2_GRACE_PERIOD_DAYS`):
 *
 * - Before expiry, only held names: a released or ownerless row has nothing
 *   to renew.
 * - At grace start, every row: an ENSv1 lease in grace is still held, while an
 *   ENSv2 registration is served `released` as soon as its expiry passes.
 * - Later in grace and at premium start, only rows that are no longer held.
 *   Those are ENSv2 registrations in their 28-day grace or premium. A row
 *   still held this long after expiry is an ENSv1 lease inside its 90-day
 *   grace, for which "grace ends soon" or "premium started" would be wrong.
 *   ENSv1 leases are only released at expiry + 90 days, outside every window.
 *
 * A row without a status is kept, as before this filter existed.
 */
export function isNotifiableAtStage(
  stage: ExpiryStageConfig,
  registrationStatus: RegistrationStatus | undefined,
): boolean {
  if (registrationStatus === undefined) return true
  const isHeld = HELD_STATUSES.has(registrationStatus)
  if (stage.offsetDays > 0) return isHeld
  if (stage.offsetDays === 0) return true
  return !isHeld
}
