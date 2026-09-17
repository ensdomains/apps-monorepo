import { TaggedError } from '@ens-apps/utils/neverthrow'
import { and, eq, gt } from 'drizzle-orm'
import { fromPromise, ok, safeTry } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { generateSiweNonce } from 'viem/siwe'
import { signJWT } from '#core/auth/jwt.js'
import { type Database, intoDbResult, TABLE } from '#core/database/index.js'
import type { ViemClient } from '#core/eth/client.js'
import { logger } from '#utils/logger.js'
import { addUserIfNotExists } from '../users'
import { safeParseSiweMessage, safeVerifySiweMessage } from './helpers'

const ALLOWED_SIWE_DOMAINS = ['app.ens.dev', 'app.ens.domains'] as const
type AllowedSiweDomain = (typeof ALLOWED_SIWE_DOMAINS)[number]

class InvalidNonceError extends TaggedError('INVALID_NONCE')<{
  message: string
}> {}

class InvalidSignatureError extends TaggedError('INVALID_SIGNATURE')<{
  message: string
}> {}

class InvalidDomainError extends TaggedError('INVALID_DOMAIN')<{
  message: string
}> {}

class InvalidUriError extends TaggedError('INVALID_URI')<{
  message: string
}> {}

class RedemptionTokenError extends TaggedError('REDEMPTION_TOKEN_ERROR')<{
  message: string
  cause?: unknown
}> {}

const AUTH_ATTEMPT_TTL_MS = 30 * 60 * 1000

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const createRedemptionToken = () =>
  fromPromise(
    Promise.resolve().then(() => {
      const bytes = new Uint8Array(32)
      crypto.getRandomValues(bytes)
      return bytesToHex(bytes)
    }),
    (cause) =>
      new RedemptionTokenError({
        message: 'Failed to create redemption token',
        cause,
      }),
  )

export const hashRedemptionToken = (redemptionToken: string) =>
  fromPromise(
    (async () => {
      const bytes = new TextEncoder().encode(redemptionToken)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      return bytesToHex(new Uint8Array(digest))
    })(),
    (cause) =>
      new RedemptionTokenError({
        message: 'Failed to hash redemption token',
        cause,
      }),
  )

export const createNonce = (db: Database) =>
  safeTry(async function* () {
    const nonce = generateSiweNonce()
    const redemptionToken = yield* createRedemptionToken()
    const redemptionTokenHash = yield* hashRedemptionToken(redemptionToken)

    yield* intoDbResult(
      db.insert(TABLE.authAttempts).values({
        nonce,
        redemption_token_hash: redemptionTokenHash,
        expires_at: new Date(Date.now() + AUTH_ATTEMPT_TTL_MS),
      }),
    )

    return ok({ nonce, redemptionToken })
  })

const hasPendingAuthAttempt = ({
  db,
  nonce,
  redemptionTokenHash,
}: {
  db: Database
  nonce: string
  redemptionTokenHash: string
}) => {
  const attempt = intoDbResult(
    db.query.authAttempts.findFirst({
      where: and(
        eq(TABLE.authAttempts.nonce, nonce),
        eq(TABLE.authAttempts.redemption_token_hash, redemptionTokenHash),
        gt(TABLE.authAttempts.expires_at, new Date()),
      ),
    }),
  )

  return attempt.map((value) => value !== undefined)
}

const consumeAuthAttempt = ({
  db,
  nonce,
  redemptionTokenHash,
}: {
  db: Database
  nonce: string
  redemptionTokenHash: string
}) =>
  intoDbResult(
    db
      .delete(TABLE.authAttempts)
      .where(
        and(
          eq(TABLE.authAttempts.nonce, nonce),
          eq(TABLE.authAttempts.redemption_token_hash, redemptionTokenHash),
          gt(TABLE.authAttempts.expires_at, new Date()),
        ),
      )
      .returning({ nonce: TABLE.authAttempts.nonce }),
  )

export const createJWT = ({
  env,
  client,
  db,
  address,
  message,
  signature,
  nonce,
  redemptionToken,
}: {
  env: CloudflareBindings
  client: ViemClient
  db: Database
  address: Address
  message: string
  signature: Hash
  nonce: string
  redemptionToken: string
}) =>
  safeTry(async function* () {
    const redemptionTokenHash = yield* hashRedemptionToken(redemptionToken)
    const pendingAttempt = yield* hasPendingAuthAttempt({
      db,
      nonce,
      redemptionTokenHash,
    })

    if (!pendingAttempt) {
      yield* new InvalidNonceError({
        message: 'Invalid nonce',
      })
    }

    const parsed = yield* safeParseSiweMessage(message)

    if (
      !parsed.domain ||
      !ALLOWED_SIWE_DOMAINS.includes(parsed.domain as AllowedSiweDomain)
    ) {
      yield* new InvalidDomainError({
        message: 'Invalid SIWE domain',
      })
    }

    const expectedUri = `https://${parsed.domain}`
    if (parsed.uri !== expectedUri) {
      yield* new InvalidUriError({
        message: 'Invalid SIWE uri',
      })
    }

    const valid = yield* safeVerifySiweMessage(client, {
      address,
      message,
      signature,
      nonce,
      domain: parsed.domain,
    })

    if (!valid) {
      yield* new InvalidSignatureError({
        message: 'Unable to verify signature',
      })
    }

    const user = yield* addUserIfNotExists(db, address)
    logger.trace('SIWE user resolved', {
      userId: user.id,
      address,
    })

    const jwt = yield* signJWT(
      {
        address,
        user_id: user.id,
      },
      env,
    )

    const consumedAttempts = yield* consumeAuthAttempt({
      db,
      nonce,
      redemptionTokenHash,
    })

    if (consumedAttempts.length === 0) {
      yield* new InvalidNonceError({
        message: 'Invalid nonce',
      })
    }

    return ok(jwt)
  })
