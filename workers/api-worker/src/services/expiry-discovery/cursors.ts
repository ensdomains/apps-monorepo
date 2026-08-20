import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import * as v from 'valibot'
import { intoKVResult, KV_KEY } from '#core/kv/index.js'
import type { ExpiryStageId } from '#types/events/index.js'
import { logger } from '#utils/logger.js'
import {
  type ExpiryStageConfig,
  getDefaultCursorForStage,
  STAGES,
} from './stages.js'

const cursorValueSchema = v.object({
  expiry_timestamp: v.number(),
})

const cursorSchema = v.object({
  'expiry-30d': v.optional(cursorValueSchema),
  'expiry-7d': v.optional(cursorValueSchema),
  'expiry-1d': v.optional(cursorValueSchema),
  'grace-start': v.optional(cursorValueSchema),
  'grace-7d': v.optional(cursorValueSchema),
  'grace-1d': v.optional(cursorValueSchema),
  'premium-start': v.optional(cursorValueSchema),
  // Legacy keys from the pre-lifecycle-stage discovery model.
  '30d': v.optional(cursorValueSchema),
  '7d': v.optional(cursorValueSchema),
  '1d': v.optional(cursorValueSchema),
  expired: v.optional(cursorValueSchema),
})

const LEGACY_CURSOR_KEYS = {
  'expiry-30d': '30d',
  'expiry-7d': '7d',
  'expiry-1d': '1d',
  'grace-start': 'expired',
} as const satisfies Partial<Record<ExpiryStageId, string>>

export type NotificationCursors = Record<
  ExpiryStageId,
  { expiry_timestamp: number }
>

class CursorParseError extends TaggedError('CURSOR_PARSE_ERROR') {}

function summarizeCursorLagSec(cursors: NotificationCursors, nowSec: number) {
  return Object.fromEntries(
    Object.entries(cursors).map(([stageId, value]) => [
      stageId,
      Math.max(0, nowSec - value.expiry_timestamp),
    ]),
  )
}

function createDefaultCursors(nowSec: number): NotificationCursors {
  return Object.fromEntries(
    STAGES.map((stage) => [
      stage.id,
      { expiry_timestamp: getDefaultCursorForStage(stage, nowSec) },
    ]),
  ) as NotificationCursors
}

function cursorForStage(
  parsed: v.InferOutput<typeof cursorSchema>,
  stage: ExpiryStageConfig,
  defaults: NotificationCursors,
) {
  const current = parsed[stage.id]
  if (current) return current

  const legacyKey =
    stage.id in LEGACY_CURSOR_KEYS
      ? LEGACY_CURSOR_KEYS[stage.id as keyof typeof LEGACY_CURSOR_KEYS]
      : undefined
  const legacy = legacyKey ? parsed[legacyKey] : undefined
  if (legacy) return legacy

  return defaults[stage.id]
}

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
    STAGES.map((stage) => [stage.id, cursorForStage(parsed, stage, defaults)]),
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
