import type { RegistrationStatus } from '@ens-apps/bigname'
import {
  SECONDS_PER_DAY,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { EXPIRY_STAGE_IDS, type ExpiryStageId } from '#types/events/index.js'

type ExpiryPhase = 'pre-expiry' | 'in-grace' | 'grace-ended'

export type ExpiryStageConfig = {
  id: ExpiryStageId
  phase: ExpiryPhase
  /** The date the stage counts back from: the expiry, or the end of grace. */
  anchor: 'expiry' | 'grace-end'
  /** Days before the anchor; 0 is the anchor itself. */
  daysBefore: number
  includeFavorites: boolean
}

const PRE_EXPIRY_STAGES: readonly ExpiryStageConfig[] = [
  {
    id: 'expiry-30d',
    phase: 'pre-expiry',
    anchor: 'expiry',
    daysBefore: 30,
    includeFavorites: false,
  },
  {
    id: 'expiry-7d',
    phase: 'pre-expiry',
    anchor: 'expiry',
    daysBefore: 7,
    includeFavorites: true,
  },
  {
    id: 'expiry-1d',
    phase: 'pre-expiry',
    anchor: 'expiry',
    daysBefore: 1,
    includeFavorites: true,
  },
]

/** A `.eth` registration's lifecycle, furthest-future to furthest-past. */
export const REGISTRATION_STAGES: readonly ExpiryStageConfig[] = [
  ...PRE_EXPIRY_STAGES,
  {
    id: 'grace-start',
    phase: 'in-grace',
    anchor: 'expiry',
    daysBefore: 0,
    includeFavorites: true,
  },
  {
    id: 'grace-7d',
    phase: 'in-grace',
    anchor: 'grace-end',
    daysBefore: 7,
    includeFavorites: true,
  },
  {
    id: 'grace-1d',
    phase: 'in-grace',
    anchor: 'grace-end',
    daysBefore: 1,
    includeFavorites: true,
  },
  {
    id: 'premium-start',
    phase: 'grace-ended',
    anchor: 'grace-end',
    daysBefore: 0,
    includeFavorites: true,
  },
]

export type ExpiryTrackId = 'eth'

export type ExpiryTrack = {
  id: ExpiryTrackId
  graceSeconds: number
  stages: readonly ExpiryStageConfig[]
}

/**
 * After cutover, .eth registrations and premigration reservations share
 * the served expiry and 28-day grace. Subnames are outside this sweep.
 */
export const TRACKS: readonly ExpiryTrack[] = [
  {
    id: 'eth',
    graceSeconds: V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY,
    stages: REGISTRATION_STAGES,
  },
]

export const MAX_STAGE_CATCH_UP_SECONDS = 2 * SECONDS_PER_DAY

/** Seconds before the served expiry when this stage starts. */
export function getStageOffsetSeconds(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
): number {
  const anchor = stage.anchor === 'expiry' ? 0 : -track.graceSeconds
  return anchor + stage.daysBefore * SECONDS_PER_DAY
}

/** Rows whose own expiry is at most this have reached the stage at `nowSec`. */
export function getUpperBoundForStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  nowSec: number,
) {
  return nowSec + getStageOffsetSeconds(stage, track)
}

/** The track's next stage after `stage`, by offset rather than list position. */
export function getCloserStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
): ExpiryStageConfig | undefined {
  const offset = getStageOffsetSeconds(stage, track)
  let closer: ExpiryStageConfig | undefined
  let closerOffset = Number.NEGATIVE_INFINITY

  for (const candidate of track.stages) {
    const candidateOffset = getStageOffsetSeconds(candidate, track)
    if (candidateOffset >= offset || candidateOffset <= closerOffset) continue
    closer = candidate
    closerOffset = candidateOffset
  }

  return closer
}

export function getLowerBoundForStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  nowSec: number,
): number {
  const closerStage = getCloserStage(stage, track)
  if (closerStage) return getUpperBoundForStage(closerStage, track, nowSec)
  return (
    getUpperBoundForStage(stage, track, nowSec) - MAX_STAGE_CATCH_UP_SECONDS
  )
}

export function getQueryCursorForStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  cursor: number,
  nowSec: number,
): number {
  return Math.max(cursor, getLowerBoundForStage(stage, track, nowSec))
}

export function getDefaultCursorForStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  nowSec: number,
): number {
  return Math.min(nowSec, getUpperBoundForStage(stage, track, nowSec))
}

/**
 * A stage's place in the lifecycle across tracks, for picking the latest of
 * one name's overlapping stages. A name's stages all come from one track.
 */
export function getExpiryStageRank(stageId: ExpiryStageId): number {
  return EXPIRY_STAGE_IDS.indexOf(stageId)
}

const HELD_STATUSES: ReadonlySet<RegistrationStatus> = new Set([
  'active',
  'wrapped',
  'registered',
])

export type StageCandidate = {
  registrationStatus: RegistrationStatus
  releaseKind?: 'expired' | 'unregistered'
}

/**
 * Whether a row placed in this stage's window should be notified, from what
 * the row shows (bigname expiry-sweep guide, section 3):
 *
 * - Before expiry, only held names; a released row has nothing to renew.
 * - In grace, an ENSv1 lease is still held, while an ENSv2 registration is
 *   served `released` (`release_kind: "expired"`) from its expiry and stays
 *   renewable until `grace_ends_at`. Both are notified.
 * - Once grace has ended, only rows released because they expired. A row
 *   still held was renewed or has not been released yet.
 *
 * A row released for another cause (an ENSv2 unregister, or no
 * `lapsed_registration`) and an `unregistered` row are never notified.
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
