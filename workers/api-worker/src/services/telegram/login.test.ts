import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Database, intoDbError } from '#core/database/index.js'
import { makeMockEnv } from '#test-utils/env.js'
import {
  claimTelegramAttempt,
  completeTelegramAttempt,
  failTelegramAttempt,
  handleTelegramMessagingRefusal,
  saveTelegramAttempt,
  type TelegramLoginAttempt,
} from './attempts.js'
import {
  TelegramAttemptThrottledError,
  TelegramAttemptUnavailableError,
  TelegramIdentityError,
  TelegramTokenExchangeError,
} from './errors.js'
import { finishTelegramLogin, startTelegramLogin } from './login.js'
import { exchangeTelegramCode, verifyTelegramIdToken } from './oidc.js'
import { makeTelegramRequest } from './utils.js'

vi.mock('./attempts.js')
vi.mock('./oidc.js', async (original) => ({
  ...(await original<typeof import('./oidc.js')>()),
  exchangeTelegramCode: vi.fn(),
  verifyTelegramIdToken: vi.fn(),
}))
vi.mock('./utils.js', async (original) => ({
  ...(await original<typeof import('./utils.js')>()),
  makeTelegramRequest: vi.fn(),
}))

const persistence = {
  claim: vi.mocked(claimTelegramAttempt),
  save: vi.mocked(saveTelegramAttempt),
  complete: vi.mocked(completeTelegramAttempt),
  fail: vi.mocked(failTelegramAttempt),
  refuse: vi.mocked(handleTelegramMessagingRefusal),
}
const provider = {
  exchange: vi.mocked(exchangeTelegramCode),
  verify: vi.mocked(verifyTelegramIdToken),
  send: vi.mocked(makeTelegramRequest),
}

describe('Telegram login result handling', () => {
  const db = {} as Database
  const bindings = makeMockEnv({
    BASE_URL: 'https://sepolia.app-api.ens.domains',
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
    provider.send.mockReset().mockReturnValue(
      okAsync({
        message_id: 1,
        date: 0,
        chat: { id: 987654321, type: 'private' },
      }),
    )
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

  it('rejects denied authorization before contacting Telegram and records failure', async () => {
    const denied = query()
    denied.delete('code')
    denied.set('error', 'access_denied')
    denied.set('error_description', 'private-provider-description')
    expect(
      (await finishTelegramLogin(db, bindings, denied))._unsafeUnwrapErr(),
    ).toMatchObject({ _tag: 'TELEGRAM_AUTHORIZATION_ERROR', reason: 'denied' })
    expect(provider.exchange).not.toHaveBeenCalled()
    expect(provider.send).not.toHaveBeenCalled()
    expect(persistence.complete).not.toHaveBeenCalled()
    expect(persistence.fail).toHaveBeenCalledWith(db, attempt.id)
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
      code: 'TELEGRAM_API_REQUEST_ERROR' as const,
      errorCode: 403,
      message: 'Forbidden',
      parameters: undefined,
      stage: 'provider' as const,
      method: 'sendMessage' as const,
      status: 403,
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
      code: 'TELEGRAM_API_REQUEST_ERROR' as const,
      errorCode: 403,
      message: 'Forbidden',
      parameters: undefined,
      stage: 'provider' as const,
      method: 'sendMessage' as const,
      status: 403,
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

  it('returns an explicit successful link only after all stages succeed', async () => {
    expect((await finish())._unsafeUnwrap()).toEqual({ id: 'channel-id' })
    expect(persistence.fail).not.toHaveBeenCalled()
    expect(provider.send).toHaveBeenCalledWith(
      bindings.TELEGRAM_BOT_TOKEN,
      'sendMessage',
      expect.objectContaining({ chat_id: 987654321 }),
    )
  })
})
