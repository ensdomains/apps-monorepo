import { TaggedError } from '@ens-apps/utils/neverthrow'
import { eq } from 'drizzle-orm'
import { ok, safeTry } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe'
import { signJWT } from '#core/auth/jwt.js'
import type { Database } from '#core/database/index.js'
import { intoDbResult } from '#core/database/index.js'
import { sessions } from '#core/database/schema/index.js'
import type { ViemClient } from '#core/eth/client.js'
import { intoKVResult, KV_KEY } from '#core/kv/index.js'
import { addUserIfNotExists } from '../users'
import { safeVerifySiweMessage } from './helpers'

const ACCESS_TOKEN_TTL_SECONDS = 60 * 15
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

const encoder = new TextEncoder()

const toBase64Url = (input: ArrayBuffer) => {
  const bytes = new Uint8Array(input)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

const generateRefreshToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toBase64Url(bytes.buffer)
}

class InvalidNonceError extends TaggedError('INVALID_NONCE')<{
  message: string
}> {}

class InvalidSignatureError extends TaggedError('INVALID_SIGNATURE')<{
  message: string
}> {}

class HashRefreshTokenError extends TaggedError('HASH_REFRESH_TOKEN_ERROR')<{
  message: string
}> {}

class InvalidRefreshTokenError extends TaggedError('INVALID_REFRESH_TOKEN')<{
  message: string
}> {}

class ExpiredRefreshTokenError extends TaggedError('EXPIRED_REFRESH_TOKEN')<{
  message: string
}> {}

class RevokedSessionError extends TaggedError('REVOKED_SESSION')<{
  message: string
}> {}

class RefreshTokenReuseError extends TaggedError('REFRESH_TOKEN_REUSE')<{
  message: string
}> {}

class DomainMismatchError extends TaggedError('DOMAIN_MISMATCH')<{
  message: string
}> {}

const hashRefreshToken = async (secret: string, token: string) => {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(token),
    )

    return toBase64Url(signature)
  } catch (err) {
    throw new HashRefreshTokenError({
      message:
        err instanceof Error
          ? err.message
          : 'Unable to create refresh token hash',
    })
  }
}

export const createNonce = (env: CloudflareBindings) => {
  const nonce = generateSiweNonce()

  return intoKVResult(
    env.KV.put(KV_KEY.AUTH.NONCE(nonce), nonce, {
      expirationTtl: 60 * 30, // 30 minutes
    }),
  ).map((_) => nonce)
}

export const verifyAndConsumeNonce = (env: CloudflareBindings, nonce: string) =>
  safeTry(async function* () {
    const value = yield* intoKVResult(env.KV.get(KV_KEY.AUTH.NONCE(nonce)))

    if (!value) {
      yield* new InvalidNonceError({
        message: 'Invalid nonce',
      })
    }

    yield* intoKVResult(env.KV.delete(KV_KEY.AUTH.NONCE(nonce)))

    return ok(value)
  })

export const createJWT = ({
  env,
  client,
  db,
  address,
  message,
  signature,
  nonce,
  userAgent,
  ip,
}: {
  env: CloudflareBindings
  client: ViemClient
  db: Database
  address: Address
  message: string
  signature: Hash
  nonce: string
  userAgent?: string
  ip?: string
}) =>
  safeTry(async function* () {
    yield* verifyAndConsumeNonce(env, nonce)

    const parsedMessage = (() => {
      try {
        return parseSiweMessage(message)
      } catch {
        return null
      }
    })()

    if (!parsedMessage) {
      yield* new InvalidSignatureError({
        message: 'Unable to parse SIWE message',
      })
      return ok(null as never)
    }

    const valid = yield* safeVerifySiweMessage(client, {
      address,
      message,
      signature,
      nonce,
      domain: parsedMessage.domain,
    })

    if (!valid) {
      yield* new InvalidSignatureError({
        message: 'Unable to verify signature',
      })
    }

    const user = yield* addUserIfNotExists(db, address)

    const refreshToken = generateRefreshToken()

    let refreshTokenHash: string
    try {
      refreshTokenHash = await hashRefreshToken(
        env.REFRESH_TOKEN_SECRET,
        refreshToken,
      )
    } catch (err) {
      if (err instanceof HashRefreshTokenError) {
        yield* err
      } else {
        yield* new HashRefreshTokenError({
          message:
            err instanceof Error ? err.message : 'Unable to hash refresh token',
        })
      }
      return ok(null as never)
    }
    const siweDomain = parsedMessage.domain ?? ''

    const sessionInsert: typeof sessions.$inferInsert = {
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      siwe_domain: siweDomain,
      created_user_agent: userAgent ?? null,
      created_ip: ip ?? null,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    }

    const session = yield* intoDbResult(
      db
        .insert(sessions)
        .values(sessionInsert)
        .returning()
        .then((rows) => rows[0]),
    )

    const jwt = yield* signJWT(
      {
        address,
        user_id: user.id,
        session_id: session.id,
      },
      env,
      ACCESS_TOKEN_TTL_SECONDS,
    )

    return ok({
      accessToken: jwt,
      refreshToken,
      session,
    })
  })

const revokeSession = (
  db: Database,
  sessionId: string,
  revokedAt: Date = new Date(),
) =>
  intoDbResult(
    db
      .update(sessions)
      .set({
        revoked_at: revokedAt,
      })
      .where(eq(sessions.id, sessionId))
      .returning()
      .then((rows) => rows[0]),
  )

const normalizeDomain = (domain: string) => {
  try {
    return new URL(domain).hostname.toLowerCase()
  } catch {
    try {
      return new URL(`http://${domain}`).hostname.toLowerCase()
    } catch {
      return domain.toLowerCase()
    }
  }
}

const hostsMatch = (origin?: string, domain?: string) => {
  if (!origin || !domain) return true

  try {
    const originHost = new URL(origin).hostname.toLowerCase()
    const domainHost = normalizeDomain(domain)
    return originHost === domainHost
  } catch {
    return origin === domain
  }
}

export const rotateSession = ({
  env,
  db,
  refreshToken,
  origin,
}: {
  env: CloudflareBindings
  db: Database
  refreshToken: string
  origin?: string
}) =>
  safeTry(async function* () {
    let hashed: string
    try {
      hashed = await hashRefreshToken(env.REFRESH_TOKEN_SECRET, refreshToken)
    } catch (err) {
      if (err instanceof HashRefreshTokenError) {
        yield* err
      } else {
        yield* new HashRefreshTokenError({
          message:
            err instanceof Error ? err.message : 'Unable to hash refresh token',
        })
      }
      return ok(null as never)
    }

    const sessionResult = yield* intoDbResult(
      db.query.sessions.findFirst({
        where: eq(sessions.refresh_token_hash, hashed),
        with: {
          user: true,
        },
      }),
    )

    const session = sessionResult

    if (!session) {
      const reusedSessionResult = yield* intoDbResult(
        db.query.sessions.findFirst({
          where: eq(sessions.previous_refresh_token_hash, hashed),
          with: {
            user: true,
          },
        }),
      )

      const reusedSession = reusedSessionResult

      if (reusedSession) {
        yield* revokeSession(db, reusedSession.id)
        yield* new RefreshTokenReuseError({
          message: 'Refresh token reuse detected; session revoked',
        })
      }

      yield* new InvalidRefreshTokenError({
        message: 'Refresh token not found',
      })
      return ok(null as never)
    }

    const activeSession = session

    if (activeSession.revoked_at) {
      yield* new RevokedSessionError({ message: 'Session revoked' })
    }

    if (activeSession.expires_at.getTime() <= Date.now()) {
      yield* revokeSession(db, activeSession.id)
      yield* new ExpiredRefreshTokenError({
        message: 'Refresh token expired',
      })
    }

    if (!hostsMatch(origin, activeSession.siwe_domain)) {
      yield* new DomainMismatchError({
        message: 'Request origin does not match SIWE domain',
      })
    }

    if (!activeSession.user) {
      yield* new InvalidRefreshTokenError({
        message: 'Session missing user',
      })
      return ok(null as never)
    }

    const newRefreshToken = generateRefreshToken()
    let newRefreshHash: string
    try {
      newRefreshHash = await hashRefreshToken(
        env.REFRESH_TOKEN_SECRET,
        newRefreshToken,
      )
    } catch (err) {
      if (err instanceof HashRefreshTokenError) {
        yield* err
      } else {
        yield* new HashRefreshTokenError({
          message:
            err instanceof Error ? err.message : 'Unable to hash refresh token',
        })
      }
      return ok(null as never)
    }

    const now = new Date()
    const updatedSession = yield* intoDbResult(
      db
        .update(sessions)
        .set({
          previous_refresh_token_hash: session.refresh_token_hash,
          refresh_token_hash: newRefreshHash,
          rotated_at: now,
          expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        })
        .where(eq(sessions.id, activeSession.id))
        .returning()
        .then((rows) => rows[0]),
    )

    const accessToken = yield* signJWT(
      {
        address: activeSession.user.address,
        user_id: activeSession.user.id,
        session_id: activeSession.id,
      },
      env,
      ACCESS_TOKEN_TTL_SECONDS,
    )

    return ok({
      accessToken,
      refreshToken: newRefreshToken,
      session: updatedSession,
    })
  })

export const revokeSessionByRefreshToken = ({
  env,
  db,
  refreshToken,
}: {
  env: CloudflareBindings
  db: Database
  refreshToken: string
}) =>
  safeTry(async function* () {
    let hashed: string
    try {
      hashed = await hashRefreshToken(env.REFRESH_TOKEN_SECRET, refreshToken)
    } catch (err) {
      if (err instanceof HashRefreshTokenError) {
        yield* err
      } else {
        yield* new HashRefreshTokenError({
          message:
            err instanceof Error ? err.message : 'Unable to hash refresh token',
        })
      }
      return ok(undefined)
    }

    const session = yield* intoDbResult(
      db.query.sessions.findFirst({
        where: eq(sessions.refresh_token_hash, hashed),
      }),
    )

    if (!session) {
      return ok(undefined)
    }

    const revoked = yield* revokeSession(db, session.id)
    return ok(revoked)
  })
