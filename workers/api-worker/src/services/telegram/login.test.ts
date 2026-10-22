import { errors } from 'jose'
import { errAsync, okAsync } from 'neverthrow'
import * as v from 'valibot'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import telegramRoutes from '#app/routes/notifications/channels/telegram.js'
import { type Database, intoDbError } from '#core/database/index.js'
import { makeMockEnv } from '#test-utils/env.js'
import { logger } from '#utils/logger.js'
import type { TelegramLoginAttempt } from './attempts.js'
import {
  TelegramAttemptThrottledError,
  TelegramAttemptUnavailableError,
  TelegramIdentityError,
  TelegramTokenExchangeError,
} from './errors.js'
import { finishTelegramLogin, startTelegramLogin } from './login.js'

const persistence = vi.hoisted(() => ({
  claim: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  refuse: vi.fn(),
}))
const provider = vi.hoisted(() => ({
  exchange: vi.fn(),
  verify: vi.fn(),
  send: vi.fn(),
}))
vi.mock('#services/telegram/attempts.js', async (original) => ({
  ...(await original<typeof import('./attempts.js')>()),
  claimTelegramAttempt: persistence.claim,
  saveTelegramAttempt: persistence.save,
  completeTelegramAttempt: persistence.complete,
  failTelegramAttempt: persistence.fail,
  handleTelegramMessagingRefusal: persistence.refuse,
}))
vi.mock('#services/telegram/oidc.js', async (original) => ({
  ...(await original<typeof import('./oidc.js')>()),
  exchangeTelegramCode: provider.exchange,
  verifyTelegramIdToken: provider.verify,
}))
vi.mock('#services/telegram/utils.js', async (original) => ({
  ...(await original<typeof import('./utils.js')>()),
  makeTelegramRequest: provider.send,
}))

describe('Telegram login result handling', () => {
  const db = {} as Database
  const bindings = makeMockEnv({
    BASE_URL: 'https://sepolia.app-api.ens.domains',
    MANAGER_APP_URL: 'https://sepolia.app.ens.domains',
    DATABASE_URL:
      'postgres://postgres:postgres@db.localtest.me:5432/api_worker_test',
    TELEGRAM_OIDC_CLIENT_ID: '123456',
    TELEGRAM_OIDC_CLIENT_SECRET: 'client-secret',
    TELEGRAM_BOT_TOKEN: '123456:bot-secret',
  })
  const attempt: TelegramLoginAttempt = {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    status: 'processing',
    code_verifier: 'private-verifier',
    nonce: 'private-nonce',
    state_digest: 'digest',
    redirect_uri: `${bindings.BASE_URL}/notifications/channels/telegram/callback`,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 600_000),
  }
  const query = () =>
    new URLSearchParams({ state: 's'.repeat(43), code: 'private-code' })
  const finish = () => finishTelegramLogin(db, bindings, query())

  beforeEach(() => {
    persistence.save.mockReset().mockReturnValue(okAsync({ id: attempt.id }))
    persistence.claim.mockReset().mockReturnValue(okAsync(attempt))
    persistence.complete
      .mockReset()
      .mockReturnValue(okAsync({ id: 'channel-id' }))
    persistence.fail.mockReset().mockReturnValue(okAsync(undefined))
    persistence.refuse.mockReset().mockReturnValue(okAsync(undefined))
    provider.exchange.mockReset().mockReturnValue(okAsync('private-id-token'))
    provider.verify.mockReset().mockReturnValue(okAsync({ id: 987654321 }))
    provider.send.mockReset().mockReturnValue(okAsync({ message_id: 1 }))
  })

  it('returns configuration, throttling and database errors without collapsing them', async () => {
    const missing = await startTelegramLogin(
      db,
      { ...bindings, TELEGRAM_OIDC_CLIENT_SECRET: '' },
      attempt.user_id,
    )
    expect(missing._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_CONFIGURATION_ERROR',
    })
    expect(persistence.save).not.toHaveBeenCalled()
    const throttle = new TelegramAttemptThrottledError({})
    persistence.save.mockReturnValueOnce(errAsync(throttle))
    expect(
      (
        await startTelegramLogin(db, bindings, attempt.user_id)
      )._unsafeUnwrapErr(),
    ).toBe(throttle)
    const database = intoDbError(new Error('database unavailable'))
    persistence.save.mockReturnValueOnce(errAsync(database))
    expect(
      (
        await startTelegramLogin(db, bindings, attempt.user_id)
      )._unsafeUnwrapErr(),
    ).toBe(database)
  })

  it.each(['', '/', '/api', '/api/'])(
    'preserves the configured public API path when constructing the callback: %s',
    async (basePath) => {
      const response = (
        await startTelegramLogin(
          db,
          {
            ...bindings,
            // Generated bindings list deployed origins; local proxies override it.
            BASE_URL:
              `https://api.example${basePath}` as CloudflareBindings['BASE_URL'],
          },
          attempt.user_id,
        )
      )._unsafeUnwrap()
      const expected = `https://api.example${basePath.startsWith('/api') ? '/api' : ''}/notifications/channels/telegram/callback`
      expect(
        new URL(response.authorizationUrl).searchParams.get('redirect_uri'),
      ).toBe(expected)
      expect(persistence.save).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ redirect_uri: expected }),
      )
    },
  )

  it('rejects invalid or consumed state without exchanging or modifying an unclaimed attempt', async () => {
    expect(
      (
        await finishTelegramLogin(db, bindings, new URLSearchParams())
      )._unsafeUnwrapErr(),
    ).toMatchObject({
      _tag: 'TELEGRAM_AUTHORIZATION_ERROR',
      reason: 'invalid_state',
    })
    expect(persistence.claim).not.toHaveBeenCalled()
    const consumed = new TelegramAttemptUnavailableError({ stage: 'claim' })
    persistence.claim.mockReturnValueOnce(errAsync(consumed))
    expect((await finish())._unsafeUnwrapErr()).toBe(consumed)
    expect(provider.exchange).not.toHaveBeenCalled()
    expect(persistence.fail).not.toHaveBeenCalled()
  })

  it('preserves token exchange failure and records the terminal failure', async () => {
    const failure = new TelegramTokenExchangeError({
      stage: 'provider',
      status: 400,
    })
    provider.exchange.mockReturnValueOnce(errAsync(failure))
    expect((await finish())._unsafeUnwrapErr()).toBe(failure)
    expect(persistence.fail).toHaveBeenCalledWith(db, attempt.id)
    expect(provider.verify).not.toHaveBeenCalled()
    expect(persistence.complete).not.toHaveBeenCalled()
  })

  it('preserves token verification failures and never sends a message or links', async () => {
    const failure = new TelegramIdentityError({
      stage: 'verification',
      cause: new Error('bad signature'),
    })
    provider.verify.mockReturnValueOnce(errAsync(failure))
    expect((await finish())._unsafeUnwrapErr()).toBe(failure)
    expect(provider.send).not.toHaveBeenCalled()
    expect(persistence.complete).not.toHaveBeenCalled()
    expect(persistence.fail).toHaveBeenCalledWith(db, attempt.id)
  })

  it('preserves messaging failures and applies guarded delivery availability handling', async () => {
    const cause = {
      code: 'TELEGRAM_API_REQUEST_ERROR',
      errorCode: 403,
      message: 'Forbidden',
    }
    provider.send.mockReturnValueOnce(errAsync(cause))
    expect((await finish())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_MESSAGING_ERROR',
      errorCode: 403,
      cause,
    })
    expect(persistence.refuse).toHaveBeenCalledWith(
      db,
      attempt.id,
      '987654321',
      cause,
    )
    expect(persistence.complete).not.toHaveBeenCalled()
    expect(persistence.fail).toHaveBeenCalledWith(db, attempt.id)
  })

  it('propagates linking database failures and records failure instead of reporting success', async () => {
    const failure = intoDbError(new Error('channel write failed'))
    persistence.complete.mockReturnValueOnce(errAsync(failure))
    expect((await finish())._unsafeUnwrapErr()).toBe(failure)
    expect(persistence.fail).toHaveBeenCalledWith(db, attempt.id)
  })

  it('retains both the authentication failure and failure-recording error', async () => {
    const failure = new TelegramTokenExchangeError({
      stage: 'request',
      cause: new Error('network unavailable'),
    })
    const cause = intoDbError(new Error('could not record failure'))
    provider.exchange.mockReturnValueOnce(errAsync(failure))
    persistence.fail.mockReturnValueOnce(errAsync(cause))
    expect((await finish())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_ATTEMPT_RECOVERY_ERROR',
      operation: 'record_failure',
      attemptId: attempt.id,
      failure,
      cause,
    })
  })

  it('retains a messaging failure when recording delivery refusal fails', async () => {
    const delivery = {
      code: 'TELEGRAM_API_REQUEST_ERROR',
      errorCode: 403,
      message: 'Forbidden',
    }
    const cause = intoDbError(new Error('availability write failed'))
    provider.send.mockReturnValueOnce(errAsync(delivery))
    persistence.refuse.mockReturnValueOnce(errAsync(cause))
    expect((await finish())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_ATTEMPT_RECOVERY_ERROR',
      operation: 'record_delivery_refusal',
      cause,
      failure: { _tag: 'TELEGRAM_MESSAGING_ERROR', cause: delivery },
    })
    expect(persistence.fail).toHaveBeenCalledWith(db, attempt.id)
  })

  it.each([false, true])(
    'keeps sensitive causes out of callback HTML and logs, including recovery failures: %s',
    async (recoveryFails) => {
      const secret =
        'private-code private-id-token private-verifier client-secret bot-secret'
      provider.exchange.mockReturnValueOnce(
        errAsync(
          new TelegramTokenExchangeError({
            stage: 'request',
            cause: new Error(secret),
          }),
        ),
      )
      if (recoveryFails)
        persistence.fail.mockReturnValueOnce(
          errAsync(intoDbError(new Error(secret))),
        )
      const log = vi
        .spyOn(logger, recoveryFails ? 'error' : 'warn')
        .mockImplementation(() => undefined)
      const response = await telegramRoutes.request(
        `/telegram/callback?${query()}`,
        {},
        bindings,
      )
      expect(await response.text()).not.toContain(secret)
      expect(log).toHaveBeenCalledWith(
        recoveryFails ? 'Telegram login failed' : 'Telegram login unsuccessful',
        expect.objectContaining({
          errorTag: recoveryFails
            ? 'TELEGRAM_ATTEMPT_RECOVERY_ERROR'
            : 'TELEGRAM_TOKEN_EXCHANGE_ERROR',
          ...(recoveryFails
            ? { failureTag: 'TELEGRAM_TOKEN_EXCHANGE_ERROR' }
            : { stage: 'request' }),
        }),
      )
      const logs = JSON.stringify(log.mock.calls)
      for (const value of secret.split(' ')) expect(logs).not.toContain(value)
      log.mockRestore()
    },
  )

  it.each([true, false])(
    'renders a safe callback page with clear return instructions (success: %s)',
    async (isSuccess) => {
      if (!isSuccess) {
        provider.verify.mockReturnValueOnce(
          errAsync(new TelegramIdentityError({ stage: 'profile' })),
        )
      }
      const response = await telegramRoutes.request(
        `/telegram/callback?${query()}&redirect_uri=https://untrusted.example`,
        {},
        bindings,
      )
      const page = await response.text()
      const nonce = /<style nonce="([^"]+)">/.exec(page)?.[1]
      expect(nonce).toBeTruthy()
      expect(response.headers.get('Content-Security-Policy')).toBe(
        `default-src 'none'; style-src 'nonce-${nonce}'; font-src https://fonts.ens.dev; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      )
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(page).toContain(
        isSuccess
          ? '<h1>Telegram connected</h1>'
          : '<h1>Connection not completed</h1>',
      )
      expect(page).toContain(
        'return to your original tab to keep your progress',
      )
      expect(page).toContain(`href="${bindings.MANAGER_APP_URL}"`)
      expect(page).not.toContain('<script')
      for (const value of [
        'private-code',
        'private-id-token',
        'private-verifier',
        'untrusted.example',
      ]) {
        expect(page).not.toContain(value)
      }
    },
  )

  it('returns an explicit successful link only after all stages succeed', async () => {
    expect((await finish())._unsafeUnwrap()).toEqual({ id: 'channel-id' })
    expect(persistence.fail).not.toHaveBeenCalled()
  })

  it('logs failed claim and nested cause diagnostics without JWT payloads', async () => {
    const secret = 'private-id-token'
    provider.verify.mockReturnValueOnce(
      errAsync(
        new TelegramIdentityError({
          stage: 'verification',
          cause: new errors.JWTClaimValidationFailed(
            'unexpected issuer',
            { iss: secret, nonce: secret },
            'iss',
            'check_failed',
          ),
        }),
      ),
    )
    const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    await telegramRoutes.request(`/telegram/callback?${query()}`, {}, bindings)
    expect(log).toHaveBeenCalledWith(
      'Telegram login unsuccessful',
      expect.objectContaining({
        stage: 'verification',
        cause: expect.objectContaining({
          errorCode: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
          claim: 'iss',
          reason: 'check_failed',
        }),
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
    log.mockRestore()
  })

  it('logs validation fields and types without the rejected input', async () => {
    const secret = 'private-profile-input'
    const parsed = v.safeParse(v.object({ id: v.number() }), { id: secret })
    provider.verify.mockReturnValueOnce(
      errAsync(
        new TelegramIdentityError({
          stage: 'profile',
          cause: parsed.issues,
        }),
      ),
    )
    const log = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    await telegramRoutes.request(`/telegram/callback?${query()}`, {}, bindings)
    expect(log).toHaveBeenCalledWith(
      'Telegram login unsuccessful',
      expect.objectContaining({
        stage: 'profile',
        cause: {
          validationIssues: [
            expect.objectContaining({
              field: 'id',
              expected: 'number',
              receivedType: 'string',
            }),
          ],
        },
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
    log.mockRestore()
  })

  it('logs database error codes without SQL or parameters', async () => {
    const secret = 'private-database-parameter'
    persistence.complete.mockReturnValueOnce(
      errAsync(
        intoDbError(Object.assign(new Error(secret), { code: '23505' })),
      ),
    )
    const log = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    await telegramRoutes.request(`/telegram/callback?${query()}`, {}, bindings)
    expect(log).toHaveBeenCalledWith(
      'Telegram login failed',
      expect.objectContaining({
        errorTag: 'DATABASE_ERROR',
        cause: expect.objectContaining({
          cause: expect.objectContaining({ errorCode: '23505' }),
        }),
      }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
    log.mockRestore()
  })
})
