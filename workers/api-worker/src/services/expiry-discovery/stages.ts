import type { Authority, RegistrationStatus } from '@ens-apps/bigname'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { ExpiryStageId } from '#types/events/index.js'

/**
 * Where a stage sits in a registration's lifecycle, which also decides who it
 * can be sent to (`isNotifiableAtStage`).
 */
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

/** Lifecycle order, furthest-future to furthest-past, on every track. */
export const STAGES: readonly ExpiryStageConfig[] = [
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

export type ExpiryTrackId = 'ens_v2' | 'ens_v1_lease' | 'ens_v1_reserved'

/**
 * One sweep of `.eth` second-level names (`GET /v1/names?parent=eth`) whose
 * registrations share an expiry rule. Each track keeps its own stage cursors,
 * in the track's own expiry time (the lease date for ENSv1).
 *
 * bigname windows `/v1/names` on the served `expires_at`, which is not always
 * the date a reminder follows (bigname expiry-sweep guide, "Expiry, grace and
 * release"):
 *
 * - An ENSv2 registration serves its own expiry, with a 28-day grace.
 * - An ENSv1 lease follows its BaseRegistrar lease (`ens_v1.expires_at`) and
 *   the registrar's 90-day grace. Before the Universal Resolver cutover, and
 *   for a lease with no live ENSv2 reservation, the served expiry is the lease
 *   itself. From the cutover a reserved lease serves its ENSv2 reservation
 *   instead, which is created 62 days after the lease so that the
 *   reservation's 28-day grace ends with the lease's 90-day one. Both kinds
 *   coexist on one network, so each gets its own track, shifted by that gap.
 *
 * A row whose dates fit neither ENSv1 track (a reservation extended without
 * renewing the lease, or a saturated lease date) is skipped and logged: the
 * guide's remedy is to re-read such names one by one, which this sweep does
 * not do.
 */
export type ExpiryTrack = {
  id: ExpiryTrackId
  /** `authority=` filter for the sweep. */
  authority: readonly Authority[]
  /** The row's own expiry: `expires_at` (ENSv2) or `ens_v1.expires_at`. */
  expirySource: 'served' | 'ens_v1'
  /** Seconds the served `expires_at` sits after the row's own expiry. */
  servedShiftSeconds: number
  /** Renewal grace after the row's own expiry, as `grace_ends_at` serves it. */
  graceSeconds: number
  /**
   * Whether the last second of grace still renews. An ENSv1 lease is released
   * only after `grace_ends_at`; an ENSv2 registration is renewable while the
   * publication time is before it.
   */
  graceEndInclusive: boolean
}

const V1_AUTHORITIES = ['ens_v1', 'ens_v0'] as const satisfies Authority[]
const V1_GRACE_SECONDS = V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY
const V2_GRACE_SECONDS = V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY

export const TRACKS: readonly ExpiryTrack[] = [
  {
    id: 'ens_v2',
    authority: ['ens_v2'],
    expirySource: 'served',
    servedShiftSeconds: 0,
    graceSeconds: V2_GRACE_SECONDS,
    graceEndInclusive: false,
  },
  {
    id: 'ens_v1_lease',
    authority: V1_AUTHORITIES,
    expirySource: 'ens_v1',
    servedShiftSeconds: 0,
    graceSeconds: V1_GRACE_SECONDS,
    graceEndInclusive: true,
  },
  {
    id: 'ens_v1_reserved',
    authority: V1_AUTHORITIES,
    expirySource: 'ens_v1',
    servedShiftSeconds: V1_GRACE_SECONDS - V2_GRACE_SECONDS,
    graceSeconds: V1_GRACE_SECONDS,
    graceEndInclusive: true,
  },
]

export const MAX_STAGE_CATCH_UP_SECONDS = 2 * SECONDS_PER_DAY

/**
 * Seconds from a row's own expiry to the start of the stage; positive is
 * before the expiry. A grace-ended stage on an inclusive grace starts one
 * second after `grace_ends_at`.
 */
export function getStageOffsetSeconds(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
): number {
  const anchor = stage.anchor === 'expiry' ? 0 : -track.graceSeconds
  const pastInclusiveGrace =
    stage.phase === 'grace-ended' && track.graceEndInclusive ? 1 : 0
  return anchor + stage.daysBefore * SECONDS_PER_DAY - pastInclusiveGrace
}

/** Rows whose own expiry is at most this have reached the stage at `nowSec`. */
export function getUpperBoundForStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  nowSec: number,
) {
  return nowSec + getStageOffsetSeconds(stage, track)
}

export function getCloserStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  stages: readonly ExpiryStageConfig[] = STAGES,
): ExpiryStageConfig | undefined {
  const offset = getStageOffsetSeconds(stage, track)
  let closer: ExpiryStageConfig | undefined
  let closerOffset = Number.NEGATIVE_INFINITY

  for (const candidate of stages) {
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
  stages: readonly ExpiryStageConfig[] = STAGES,
): number {
  const closerStage = getCloserStage(stage, track, stages)
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
  stages: readonly ExpiryStageConfig[] = STAGES,
): number {
  return Math.max(cursor, getLowerBoundForStage(stage, track, nowSec, stages))
}

export function getDefaultCursorForStage(
  stage: ExpiryStageConfig,
  track: ExpiryTrack,
  nowSec: number,
): number {
  return Math.min(nowSec, getUpperBoundForStage(stage, track, nowSec))
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
