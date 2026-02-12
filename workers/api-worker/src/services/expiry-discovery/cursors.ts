import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import * as v from 'valibot'
import { intoKVResult, KV_KEY } from '#core/kv/index.js'
import type { ExpiryStageId } from '#types/events/index.js'

const cursorValueSchema = v.object({
  expiry_timestamp: v.number(),
})

const cursorSchema = v.object({
  '30d': v.optional(cursorValueSchema),
  '7d': v.optional(cursorValueSchema),
  '1d': v.optional(cursorValueSchema),
  expired: v.optional(cursorValueSchema),
})

export type NotificationCursors = Record<
  ExpiryStageId,
  { expiry_timestamp: number }
>

class CursorParseError extends TaggedError('CURSOR_PARSE_ERROR') {}

function createDefaultCursors(nowSec: number): NotificationCursors {
  return {
    '30d': { expiry_timestamp: nowSec },
    '7d': { expiry_timestamp: nowSec },
    '1d': { expiry_timestamp: nowSec },
    expired: { expiry_timestamp: nowSec },
  }
}

export const loadNotificationCursors = ResultFn(async function* (
  env: CloudflareBindings,
  nowSec: number,
) {
  const value = yield* intoKVResult(
    env.KV.get(KV_KEY.EXPIRY_DISCOVERY.CURSORS, 'json'),
  )

  if (!value) {
    return ok(createDefaultCursors(nowSec))
  }

  let parsed: v.InferOutput<typeof cursorSchema>
  try {
    parsed = v.parse(cursorSchema, value)
  } catch (error) {
    return yield* new CursorParseError({
      message: 'Failed to parse notification cursor state from KV',
      cause: error,
    })
  }

  const defaults = createDefaultCursors(nowSec)

  return ok({
    '30d': parsed['30d'] ?? defaults['30d'],
    '7d': parsed['7d'] ?? defaults['7d'],
    '1d': parsed['1d'] ?? defaults['1d'],
    expired: parsed.expired ?? defaults.expired,
  })
})

export const storeNotificationCursors = ResultFn(async function* (
  env: CloudflareBindings,
  cursors: NotificationCursors,
) {
  yield* intoKVResult(
    env.KV.put(KV_KEY.EXPIRY_DISCOVERY.CURSORS, JSON.stringify(cursors)),
  )

  return ok(undefined)
})
