import {
  fromSync,
  type InferOkTypes,
  ResultFn,
} from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import type { Database } from '#core/database/index.js'
import {
  claimTelegramAttempt,
  completeTelegramAttempt,
  failTelegramAttempt,
  handleTelegramMessagingRefusal,
  saveTelegramAttempt,
  type TelegramLoginAttempt,
} from './attempts.js'
import {
  TelegramAttemptRecoveryError,
  TelegramAuthorizationError,
  TelegramConfigurationError,
  TelegramCryptoError,
  TelegramMessagingError,
} from './errors.js'
import {
  createTelegramAuthorization,
  digestParameter,
  exchangeTelegramCode,
  TELEGRAM_CALLBACK_PATH,
  TELEGRAM_LOGIN_TTL_MS,
  verifyTelegramIdToken,
} from './oidc.js'
import { makeTelegramRequest } from './utils.js'

const getConfiguration = ResultFn(function* (env: CloudflareBindings) {
  if (
    !env.TELEGRAM_OIDC_CLIENT_ID ||
    !env.TELEGRAM_OIDC_CLIENT_SECRET ||
    env.TELEGRAM_OIDC_CLIENT_ID !== env.TELEGRAM_BOT_TOKEN?.split(':')[0]
  ) {
    return yield* new TelegramConfigurationError({})
  }
  const redirectUri = yield* fromSync(
    () => {
      const baseUrl = new URL(env.BASE_URL)
      baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/`
      return new URL(TELEGRAM_CALLBACK_PATH, baseUrl).toString()
    },
    (cause) => new TelegramConfigurationError({ cause }),
  )
  return ok({
    clientId: env.TELEGRAM_OIDC_CLIENT_ID,
    clientSecret: env.TELEGRAM_OIDC_CLIENT_SECRET,
    botToken: env.TELEGRAM_BOT_TOKEN,
    redirectUri,
  })
})

export const startTelegramLogin = ResultFn(async function* (
  db: Database,
  env: CloudflareBindings,
  userId: string,
) {
  const config = yield* getConfiguration(env)
  const auth = yield* createTelegramAuthorization(
    config.clientId,
    config.redirectUri,
  )
  const id = yield* fromSync(
    () => crypto.randomUUID(),
    (cause) => new TelegramCryptoError({ cause }),
  )
  const expiresAt = new Date(Date.now() + TELEGRAM_LOGIN_TTL_MS)
  const attempt = yield* saveTelegramAttempt(db, {
    id,
    user_id: userId,
    state_digest: auth.stateDigest,
    code_verifier: auth.codeVerifier,
    nonce: auth.nonce,
    redirect_uri: config.redirectUri,
    status: 'pending',
    created_at: new Date(),
    expires_at: expiresAt,
  })
  return ok({
    id: attempt.id,
    authorizationUrl: auth.authorizationUrl,
    expires_at: expiresAt,
  })
})

type Configuration = InferOkTypes<ReturnType<typeof getConfiguration>>

const authenticateClaimedAttempt = ResultFn(async function* (
  db: Database,
  config: Configuration,
  attempt: TelegramLoginAttempt,
  query: URLSearchParams,
) {
  if (query.has('error'))
    return yield* new TelegramAuthorizationError({ reason: 'denied' })
  const code = query.get('code')
  if (!code || code.length > 4096 || query.getAll('code').length !== 1) {
    return yield* new TelegramAuthorizationError({ reason: 'invalid_code' })
  }
  if (!attempt.code_verifier || !attempt.nonce)
    return yield* new TelegramAuthorizationError({
      reason: 'missing_credentials',
    })
  const token = yield* exchangeTelegramCode({
    ...config,
    code,
    codeVerifier: attempt.code_verifier,
    redirectUri: attempt.redirect_uri,
  })
  const identity = yield* verifyTelegramIdToken(
    token,
    config.clientId,
    attempt.nonce,
  )
  const sent = await makeTelegramRequest(config.botToken, 'sendMessage', {
    chat_id: identity.id,
    text: 'Telegram messaging is enabled for ENS notifications. Return to ENS Manager to check your connection and notification preferences.',
  })
  if (sent.isErr()) {
    const failure = new TelegramMessagingError({
      cause: sent.error,
      errorCode: 'errorCode' in sent.error ? sent.error.errorCode : undefined,
    })
    const recorded = await handleTelegramMessagingRefusal(
      db,
      attempt.id,
      identity.id.toString(),
      sent.error,
    )
    if (recorded.isErr())
      return yield* new TelegramAttemptRecoveryError({
        attemptId: attempt.id,
        operation: 'record_delivery_refusal',
        failure,
        cause: recorded.error,
      })
    return yield* failure
  }
  const channel = yield* completeTelegramAttempt(db, attempt.id, identity)
  return ok(channel)
})

export const finishTelegramLogin = ResultFn(async function* (
  db: Database,
  env: CloudflareBindings,
  query: URLSearchParams,
) {
  const config = yield* getConfiguration(env)
  const state = query.get('state')
  if (
    !state ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    query.getAll('state').length !== 1
  ) {
    return yield* new TelegramAuthorizationError({ reason: 'invalid_state' })
  }
  const digest = yield* digestParameter(state)
  const attempt = yield* claimTelegramAttempt(db, digest)
  const result = await authenticateClaimedAttempt(db, config, attempt, query)
  if (result.isOk()) return result

  // Do not hide a failed cleanup behind the original failure. Both remain in
  // the typed Result, while cancellation/replacement is left untouched.
  const recorded = await failTelegramAttempt(db, attempt.id)
  if (recorded.isErr())
    return yield* new TelegramAttemptRecoveryError({
      attemptId: attempt.id,
      operation: 'record_failure',
      failure: result.error,
      cause: recorded.error,
    })
  return result
})
