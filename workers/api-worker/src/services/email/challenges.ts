import { and, eq, gt, lt, lte, ne, or, sql } from 'drizzle-orm'
import type { Database } from '#core/database/index.js'
import { TABLE } from '#core/database/index.js'
import { randomUUIDv7 } from '#core/database/utils/schemaHelpers.js'

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000
export const EMAIL_OTP_MAX_ATTEMPTS = 5
export const EMAIL_OTP_MAX_SENDS = 5

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export const generateEmailOtp = () => {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return ((bytes[0] ?? 0) % 1_000_000).toString().padStart(6, '0')
}

export const digestEmailOtp = async (
  secret: string,
  userId: string,
  otp: string,
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const payload = new TextEncoder().encode(`ens:email-otp:v1:${userId}:${otp}`)
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, payload)))
}

/** One row per account; rotation invalidates the previous code. */
export const issueEmailChallenge = async (
  db: Database,
  input: { userId: string; email: string; digest: string },
) => {
  const now = new Date()
  const [challenge] = await db
    .insert(TABLE.emailVerifications)
    .values({
      user_id: input.userId,
      email: input.email,
      otp_digest: input.digest,
      expires_at: new Date(now.getTime() + EMAIL_OTP_TTL_MS),
      last_sent_at: now,
    })
    .onConflictDoUpdate({
      target: TABLE.emailVerifications.user_id,
      set: {
        email: input.email,
        otp_digest: input.digest,
        expires_at: new Date(now.getTime() + EMAIL_OTP_TTL_MS),
        last_sent_at: now,
        created_at: now,
        attempts: 0,
        send_count: sql`CASE WHEN ${TABLE.emailVerifications.expires_at} <= ${now} THEN 1 ELSE ${TABLE.emailVerifications.send_count} + 1 END`,
      },
      setWhere: or(
        lte(TABLE.emailVerifications.expires_at, now),
        lt(TABLE.emailVerifications.send_count, EMAIL_OTP_MAX_SENDS),
      ),
    })
    .returning({
      id: TABLE.emailVerifications.id,
      expires_at: TABLE.emailVerifications.expires_at,
    })
  return challenge ?? null
}

export const getPendingEmailChallenges = (db: Database, userId: string) =>
  db.query.emailVerifications.findMany({
    columns: { id: true, email: true, last_sent_at: true },
    where: and(
      eq(TABLE.emailVerifications.user_id, userId),
      gt(TABLE.emailVerifications.expires_at, new Date()),
    ),
  })

export const cancelEmailChallenge = async (
  db: Database,
  userId: string,
  challengeId: string,
) => {
  const [deleted] = await db
    .delete(TABLE.emailVerifications)
    .where(
      and(
        eq(TABLE.emailVerifications.id, challengeId),
        eq(TABLE.emailVerifications.user_id, userId),
      ),
    )
    .returning({ id: TABLE.emailVerifications.id })
  return Boolean(deleted)
}

/**
 * DELETE RETURNING is the one-time redemption gate: the INSERT SELECT only has
 * a row to insert when the owned, valid challenge was deleted. Both operations
 * are one statement, so an insert failure also rolls back the deletion.
 */
export const redeemEmailChallenge = async (
  db: Database,
  input: { userId: string; challengeId: string; digest: string },
): Promise<{ id: string; email: string } | null> => {
  const redeemed = db.$with('redeemed').as(
    db
      .delete(TABLE.emailVerifications)
      .where(
        and(
          eq(TABLE.emailVerifications.id, input.challengeId),
          eq(TABLE.emailVerifications.user_id, input.userId),
          eq(TABLE.emailVerifications.otp_digest, input.digest),
          gt(TABLE.emailVerifications.expires_at, sql`now()`),
          lt(TABLE.emailVerifications.attempts, EMAIL_OTP_MAX_ATTEMPTS),
        ),
      )
      .returning({
        user_id: TABLE.emailVerifications.user_id,
        email: TABLE.emailVerifications.email,
      }),
  )
  const [established] = await db
    .with(redeemed)
    .insert(TABLE.userChannels)
    .select(
      db
        // Drizzle requires the projection to match user_channels column order.
        .select({
          id: randomUUIDv7.as('id'),
          user_id: redeemed.user_id,
          channel: sql<'email'>`'email'`.as('channel'),
          target: redeemed.email,
          data: sql<null>`null`.as('data'),
          verified_at: sql<Date>`now()`.as('verified_at'),
          status: sql<'verified'>`'verified'`.as('status'),
          status_reason: sql<null>`null`.as('status_reason'),
          last_sent_at: sql<null>`null`.as('last_sent_at'),
          last_bounce_at: sql<null>`null`.as('last_bounce_at'),
        })
        .from(redeemed),
    )
    .onConflictDoUpdate({
      target: [
        TABLE.userChannels.user_id,
        TABLE.userChannels.channel,
        TABLE.userChannels.target,
      ],
      set: { status: 'verified', status_reason: null, verified_at: sql`now()` },
    })
    .returning({ id: TABLE.userChannels.id, email: TABLE.userChannels.target })
  if (established?.email)
    return { id: established.id, email: established.email }

  // Only a challenge owned by this account can consume an attempt.
  await db
    .update(TABLE.emailVerifications)
    .set({ attempts: sql`${TABLE.emailVerifications.attempts} + 1` })
    .where(
      and(
        eq(TABLE.emailVerifications.id, input.challengeId),
        eq(TABLE.emailVerifications.user_id, input.userId),
        gt(TABLE.emailVerifications.expires_at, new Date()),
        lt(TABLE.emailVerifications.attempts, EMAIL_OTP_MAX_ATTEMPTS),
        ne(TABLE.emailVerifications.otp_digest, input.digest),
      ),
    )
  return null
}
