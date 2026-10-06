import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import * as v from 'valibot'
import { intoKVResult, KV_KEY } from '#core/kv/index.js'
import type { ExpiryStageId } from '#types/events/index.js'
import { logger } from '#utils/logger.js'
import {
  type ExpiryStageConfig,
  type ExpiryTrack,
  type ExpiryTrackId,
  getDefaultCursorForStage,
  TRACKS,
} from './stages.js'

const cursorValueSchema = v.object({
  expiry_timestamp: v.number(),
})

const stageCursorsSchema = v.object({
  'expiry-30d': v.optional(cursorValueSchema),
  'expiry-7d': v.optional(cursorValueSchema),
  'expiry-1d': v.optional(cursorValueSchema),
  'grace-start': v.optional(cursorValueSchema),
  'grace-7d': v.optional(cursorValueSchema),
  'grace-1d': v.optional(cursorValueSchema),
  'premium-start': v.optional(cursorValueSchema),
  expired: v.optional(cursorValueSchema),
})

type StoredStageCursors = v.InferOutput<typeof stageCursorsSchema>

/**
 * Legacy top-level stage cursors use served expiry and carry over only to
 * ENSv2. ENSv1 cursors use the original lease date; subnames were not swept.
 */
const cursorSchema = v.object({
  ...stageCursorsSchema.entries,
  ens_v2: v.optional(stageCursorsSchema),
  ens_v1_reserved: v.optional(stageCursorsSchema),
  subname: v.optional(stageCursorsSchema),
})

/** Cursors for the track's own stages; other stage ids are absent. */
export type StageCursors = Partial<
  Record<ExpiryStageId, { expiry_timestamp: number }>
>
export type NotificationCursors = Record<ExpiryTrackId, StageCursors>

class CursorParseError extends TaggedError('CURSOR_PARSE_ERROR') {}

function summarizeCursorLagSec(cursors: NotificationCursors, nowSec: number) {
  return Object.fromEntries(
    Object.entries(cursors).map(([trackId, stages]) => [
      trackId,
      Object.fromEntries(
        Object.entries(stages).map(([stageId, value]) => [
          stageId,
          Math.max(0, nowSec - value.expiry_timestamp),
        ]),
      ),
    ]),
  )
}

function createDefaultStageCursors(
  track: ExpiryTrack,
  nowSec: number,
): StageCursors {
  return Object.fromEntries(
    track.stages.map((stage) => [
      stage.id,
      { expiry_timestamp: getDefaultCursorForStage(stage, track, nowSec) },
    ]),
  )
}

function createDefaultCursors(nowSec: number): NotificationCursors {
  return Object.fromEntries(
    TRACKS.map((track) => [track.id, createDefaultStageCursors(track, nowSec)]),
  ) as NotificationCursors
}

const fillStageCursors = (
  track: ExpiryTrack,
  stored: StoredStageCursors | undefined,
  defaults: StageCursors,
): StageCursors =>
  Object.fromEntries(
    track.stages.map((stage) => [
      stage.id,
      stored?.[stage.id] ?? defaults[stage.id],
    ]),
  )

/**
 * The stage's cursor. Loaded cursors hold every stage of every track; the
 * default only covers a value built some other way.
 */
export const getStageCursor = (
  cursors: NotificationCursors,
  track: ExpiryTrack,
  stage: ExpiryStageConfig,
  nowSec: number,
): number =>
  cursors[track.id][stage.id]?.expiry_timestamp ??
  getDefaultCursorForStage(stage, track, nowSec)

export const loadNotificationCursors = ResultFn(async function* (
  env: CloudflareBindings,
  nowSec: number,
) {
  const value = yield* intoKVResult(
    env.KV.get(KV_KEY.EXPIRY_DISCOVERY.CURSORS, 'json'),
  )

  if (!value) {
    const defaults = createDefaultCursors(nowSec)
    logger.debug('No expiry cursors found in KV, using defaults', {
      nowSec,
      cursors: defaults,
    })
    return ok(defaults)
  }

  let parsed: v.InferOutput<typeof cursorSchema>
  try {
    parsed = v.parse(cursorSchema, value)
  } catch (error) {
    logger.warn('Failed to parse notification cursors from KV', {
      error: String(error),
      valueType: typeof value,
    })
    return yield* new CursorParseError({
      message: 'Failed to parse notification cursor state from KV',
      cause: error,
    })
  }

  const defaults = createDefaultCursors(nowSec)
  const normalized = Object.fromEntries(
    TRACKS.map((track) => {
      const legacy = track.id === 'ens_v2' ? parsed : undefined
      return [
        track.id,
        fillStageCursors(track, parsed[track.id] ?? legacy, defaults[track.id]),
      ]
    }),
  ) as NotificationCursors

  logger.trace('Loaded and normalized expiry cursors', {
    cursors: normalized,
    lagSecByStage: summarizeCursorLagSec(normalized, nowSec),
  })

  return ok(normalized)
})

export const storeNotificationCursors = ResultFn(async function* (
  env: CloudflareBindings,
  cursors: NotificationCursors,
) {
  logger.debug('Persisting expiry cursors', { cursors })
  yield* intoKVResult(
    env.KV.put(KV_KEY.EXPIRY_DISCOVERY.CURSORS, JSON.stringify(cursors)),
  )

  return ok(undefined)
})
