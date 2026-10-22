import { ResultFn } from '@ens-apps/utils/neverthrow'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { err, fromPromise, fromThrowable, ok } from 'neverthrow'
import * as v from 'valibot'
import {
  TelegramCryptoError,
  TelegramIdentityError,
  TelegramTokenExchangeError,
} from './errors.js'

export const TELEGRAM_ISSUER = 'https://oauth.telegram.org'
export const TELEGRAM_CALLBACK_PATH =
  '/notifications/channels/telegram/callback'
export const TELEGRAM_LOGIN_TTL_MS = 10 * 60 * 1000

const telegramKeys = createRemoteJWKSet(
  new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`),
  { timeoutDuration: 5_000 },
)
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const randomParameter = fromThrowable(
  () => base64url(crypto.getRandomValues(new Uint8Array(32))),
  (cause) => new TelegramCryptoError({ cause }),
)

export const digestParameter = (value: string) =>
  fromPromise(
    Promise.resolve()
      .then(() =>
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
      )
      .then((digest) => base64url(new Uint8Array(digest))),
    (cause) => new TelegramCryptoError({ cause }),
  )

export const createTelegramAuthorization = ResultFn(async function* (
  clientId: string,
  redirectUri: string,
) {
  const state = yield* randomParameter()
  const codeVerifier = yield* randomParameter()
  const nonce = yield* randomParameter()
  const challenge = yield* digestParameter(codeVerifier)
  const stateDigest = yield* digestParameter(state)
  const url = new URL(`${TELEGRAM_ISSUER}/auth`)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile telegram:bot_access',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  return ok({
    authorizationUrl: url.toString(),
    stateDigest,
    codeVerifier,
    nonce,
  })
})

const telegramIdentitySchema = v.object({
  // The OIDC subject is distinct from the Bot API user/chat ID.
  id: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  name: v.optional(v.pipe(v.string(), v.maxLength(256))),
  preferred_username: v.optional(v.pipe(v.string(), v.maxLength(64))),
})
export type TelegramIdentity = v.InferOutput<typeof telegramIdentitySchema>

export const verifyTelegramIdToken = (
  token: string,
  clientId: string,
  nonce: string,
  keys: Parameters<typeof jwtVerify>[1] = telegramKeys,
) =>
  fromPromise(
    jwtVerify(token, keys, {
      issuer: TELEGRAM_ISSUER,
      audience: clientId,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'nonce', 'id'],
      maxTokenAge: '10 minutes',
      clockTolerance: 5,
    }),
    (cause) => new TelegramIdentityError({ stage: 'verification', cause }),
  ).andThen(({ payload }) => {
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      payload.nonce !== nonce ||
      (payload.azp !== undefined && payload.azp !== clientId) ||
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp !== clientId)
    ) {
      return err(new TelegramIdentityError({ stage: 'claims' }))
    }
    const parsed = v.safeParse(telegramIdentitySchema, payload)
    return parsed.success
      ? ok(parsed.output)
      : err(
          new TelegramIdentityError({ stage: 'profile', cause: parsed.issues }),
        )
  })

export const exchangeTelegramCode = ResultFn(async function* (params: {
  clientId: string
  clientSecret: string
  code: string
  codeVerifier: string
  redirectUri: string
}) {
  const credentials = yield* fromThrowable(
    () => btoa(`${params.clientId}:${params.clientSecret}`),
    (cause) => new TelegramTokenExchangeError({ stage: 'credentials', cause }),
  )()
  const response = yield* fromPromise(
    fetch(`${TELEGRAM_ISSUER}/token`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      }),
    }),
    (cause) => new TelegramTokenExchangeError({ stage: 'request', cause }),
  )
  if (!response.ok)
    return yield* new TelegramTokenExchangeError({
      stage: 'provider',
      status: response.status,
    })
  const json = yield* fromPromise(
    response.json(),
    (cause) => new TelegramTokenExchangeError({ stage: 'decode', cause }),
  )
  const parsed = v.safeParse(
    v.object({ id_token: v.pipe(v.string(), v.minLength(1)) }),
    json,
  )
  if (!parsed.success)
    return yield* new TelegramTokenExchangeError({
      stage: 'response',
      cause: parsed.issues,
    })
  return ok(parsed.output.id_token)
})
