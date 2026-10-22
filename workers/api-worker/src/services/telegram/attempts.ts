import type { ChannelData } from '@ens-apps/shared-schema/notifications'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { ok, okAsync } from 'neverthrow'
import { type Database, intoDbResult, TABLE } from '#core/database/index.js'
import { randomUUIDv7 } from '#core/database/utils/schemaHelpers.js'
import { classifyDeliveryError } from '#services/delivery/classifier.js'
import {
  TelegramAttemptThrottledError,
  TelegramAttemptUnavailableError,
} from './errors.js'
import type { TelegramIdentity } from './oidc.js'

const attempts = TABLE.telegramLoginAttempts
export type TelegramLoginAttempt = typeof attempts.$inferSelect

export const handleTelegramMessagingRefusal = (
  db: Database,
  attemptId: string,
  target: string,
  error: { code: string; errorCode?: number; message?: string },
) => {
  const forbidden = error.errorCode === 403
  const permanent =
    classifyDeliveryError('telegram', error.message ?? '').category ===
    'hard_bounce'
  if (!forbidden && !permanent) return okAsync(undefined)
  // Serialize with cancellation/replacement before updating the channel. If
  // either wins the attempt lock first, this refusal cannot affect its successor.
  const currentAttempt = db.$with('current_attempt').as(
    db
      .select({ user_id: attempts.user_id })
      .from(attempts)
      .where(
        and(
          eq(attempts.id, attemptId),
          eq(attempts.status, 'processing'),
          gt(attempts.expires_at, sql`now()`),
        ),
      )
      .for('update'),
  )
  return intoDbResult(
    db
      .with(currentAttempt)
      .update(TABLE.userChannels)
      .set({
        status: 'disabled',
        status_reason: forbidden
          ? 'FORBIDDEN_BY_TELEGRAM'
          : 'TELEGRAM_DELIVERY_UNAVAILABLE',
      })
      .from(currentAttempt)
      .where(
        and(
          eq(TABLE.userChannels.user_id, currentAttempt.user_id),
          eq(TABLE.userChannels.channel, 'telegram'),
          eq(TABLE.userChannels.target, target),
        ),
      ),
  ).map(() => undefined)
}

export const getTelegramAttempt = (db: Database, userId: string) =>
  intoDbResult(
    db.query.telegramLoginAttempts.findFirst({
      columns: { id: true, status: true, expires_at: true },
      where: eq(attempts.user_id, userId),
    }),
  ).map((attempt) => {
    if (!attempt) return null
    return {
      ...attempt,
      status:
        attempt.expires_at.getTime() <= Date.now() &&
        (attempt.status === 'pending' || attempt.status === 'processing')
          ? ('expired' as const)
          : attempt.status,
    }
  })

export const saveTelegramAttempt = ResultFn(async function* (
  db: Database,
  values: typeof attempts.$inferInsert,
) {
  const [attempt] = yield* intoDbResult(
    db
      .insert(attempts)
      .values(values)
      .onConflictDoUpdate({
        target: attempts.user_id,
        set: values,
        setWhere: lt(attempts.created_at, new Date(Date.now() - 10_000)),
      })
      .returning({ id: attempts.id }),
  )
  if (!attempt) return yield* new TelegramAttemptThrottledError({})
  return ok(attempt)
})

export const claimTelegramAttempt = ResultFn(async function* (
  db: Database,
  stateDigest: string,
) {
  const [attempt] = yield* intoDbResult(
    db
      .update(attempts)
      .set({ status: 'processing' })
      .where(
        and(
          eq(attempts.state_digest, stateDigest),
          eq(attempts.status, 'pending'),
          gt(attempts.expires_at, sql`now()`),
        ),
      )
      .returning(),
  )
  if (!attempt)
    return yield* new TelegramAttemptUnavailableError({ stage: 'claim' })
  return ok(attempt)
})

export const failTelegramAttempt = (db: Database, id: string) =>
  intoDbResult(
    db
      .update(attempts)
      .set({ status: 'failed', code_verifier: null, nonce: null })
      .where(and(eq(attempts.id, id), eq(attempts.status, 'processing'))),
  ).map(() => undefined)

export const cancelTelegramAttempt = (
  db: Database,
  userId: string,
  id: string,
) =>
  intoDbResult(
    db
      .update(attempts)
      .set({ status: 'cancelled', code_verifier: null, nonce: null })
      .where(
        and(
          eq(attempts.id, id),
          eq(attempts.user_id, userId),
          inArray(attempts.status, ['pending', 'processing']),
        ),
      ),
  ).map(() => undefined)

export const removeTelegramChannel = (
  db: Database,
  userId: string,
  channelId: string,
) =>
  intoDbResult(
    db.batch([
      db
        .update(attempts)
        .set({ status: 'cancelled', code_verifier: null, nonce: null })
        .where(
          and(
            eq(attempts.user_id, userId),
            inArray(attempts.status, ['pending', 'processing']),
          ),
        ),
      db
        .delete(TABLE.userChannels)
        .where(
          and(
            eq(TABLE.userChannels.id, channelId),
            eq(TABLE.userChannels.user_id, userId),
            eq(TABLE.userChannels.channel, 'telegram'),
          ),
        ),
    ]),
  ).map(() => undefined)

export const completeTelegramAttempt = ResultFn(async function* (
  db: Database,
  id: string,
  identity: TelegramIdentity,
) {
  const data: ChannelData['telegram'] = {
    username: identity.preferred_username,
    name: identity.name,
  }
  // Follow email redemption's Drizzle CTE pattern: finalization and channel
  // upsert are one atomic statement, including rollback if the upsert fails.
  const completed = db.$with('completed').as(
    db
      .update(attempts)
      .set({ status: 'completed', code_verifier: null, nonce: null })
      .where(
        and(
          eq(attempts.id, id),
          eq(attempts.status, 'processing'),
          gt(attempts.expires_at, sql`now()`),
        ),
      )
      .returning({ user_id: attempts.user_id }),
  )
  const [channel] = yield* intoDbResult(
    db
      .with(completed)
      .insert(TABLE.userChannels)
      .select(
        db
          .select({
            // INSERT SELECT must follow the schema's column order. SQL fragments here
            // are typed scalar values/functions; all statements use Drizzle builders.
            id: randomUUIDv7.as('id'),
            user_id: completed.user_id,
            channel: sql<'telegram'>`${'telegram'}`.as('channel'),
            target: sql<string>`${identity.id.toString()}`.as('target'),
            data: sql<
              ChannelData['telegram']
            >`${sql.param(data, TABLE.userChannels.data)}`.as('data'),
            verified_at: sql<Date>`now()`.as('verified_at'),
            status: sql<'verified'>`${'verified'}`.as('status'),
            status_reason: sql<null>`${null}`.as('status_reason'),
            last_sent_at: sql<null>`${null}`.as('last_sent_at'),
            last_bounce_at: sql<null>`${null}`.as('last_bounce_at'),
          })
          .from(completed),
      )
      .onConflictDoUpdate({
        target: [
          TABLE.userChannels.user_id,
          TABLE.userChannels.channel,
          TABLE.userChannels.target,
        ],
        set: {
          data,
          status: 'verified',
          status_reason: null,
          verified_at: new Date(),
        },
      })
      .returning({ id: TABLE.userChannels.id }),
  )
  if (!channel)
    return yield* new TelegramAttemptUnavailableError({ stage: 'complete' })
  return ok(channel)
})
