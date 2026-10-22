import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { and, eq, inArray } from 'drizzle-orm'
import { sign } from 'hono/jwt'
import { errAsync, fromPromise, okAsync } from 'neverthrow'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import app from '#app/index.js'
import { type Database, getDatabase, TABLE } from '#core/database/index.js'
import { makeMockEnv } from '#test-utils/env.js'
import { requireLocalTestDatabase } from '#test-utils/real-db-config.js'
import {
  cancelTelegramAttempt,
  claimTelegramAttempt,
  completeTelegramAttempt,
  handleTelegramMessagingRefusal,
} from './attempts.js'
import { TelegramIdentityError, TelegramTokenExchangeError } from './errors.js'
import { digestParameter } from './oidc.js'

const provider = vi.hoisted(() => ({
  exchange: vi.fn(),
  verify: vi.fn(),
  send: vi.fn(),
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

const testEnv = env as CloudflareBindings & {
  RUN_REAL_DB_TESTS: string
  REAL_DB_DATABASE_URL: string
}
const path = '/notifications/channels/telegram'

describe.skipIf(testEnv.RUN_REAL_DB_TESTS !== '1')(
  'Telegram OAuth persistence and routes',
  () => {
    let db: Database
    let bindings: CloudflareBindings
    let users: { id: string; address: string }[] = []

    beforeAll(() => {
      bindings = makeMockEnv({
        ...env,
        DATABASE_URL: requireLocalTestDatabase(
          testEnv.RUN_REAL_DB_TESTS,
          testEnv.REAL_DB_DATABASE_URL,
        ),
        JWT_SECRET: 'telegram-local-test-secret',
        TELEGRAM_OIDC_CLIENT_ID: '123456',
        TELEGRAM_OIDC_CLIENT_SECRET: 'test-client-secret',
        TELEGRAM_BOT_TOKEN: '123456:test-bot-secret',
      })
      db = getDatabase(bindings)
    })
    beforeEach(async () => {
      users = Array.from({ length: 2 }, () => ({
        id: crypto.randomUUID(),
        address: `0x${crypto.randomUUID().replaceAll('-', '')}`,
      }))
      await db.insert(TABLE.users).values(users)
      provider.exchange
        .mockReset()
        .mockReturnValue(okAsync('verified-by-unit-tests'))
      provider.verify
        .mockReset()
        .mockReturnValue(okAsync({ id: 987654321, name: 'Alice' }))
      provider.send.mockReset().mockReturnValue(okAsync({ message_id: 1 }))
    })
    afterEach(async () => {
      if (users.length)
        await db.delete(TABLE.users).where(
          inArray(
            TABLE.users.id,
            users.map((u) => u.id),
          ),
        )
    })

    const user = (index = 0) => {
      const value = users[index]
      if (!value) throw new Error('Missing fixture user')
      return value
    }
    const request = async (
      route: string,
      method = 'GET',
      index = 0,
      origin = 'https://api.example',
    ) => {
      const token = await sign(
        {
          user_id: user(index).id,
          address: user(index).address,
          exp: Math.floor(Date.now() / 1000) + 600,
        },
        bindings.JWT_SECRET,
      )
      return app.request(
        `${origin}${path}${route}`,
        { method, headers: { Authorization: `Bearer ${token}` } },
        bindings,
        createExecutionContext(),
      )
    }
    const start = async () => {
      const response = await request('/oauth', 'POST')
      expect(response.status).toBe(200)
      return response.json() as Promise<{
        id: string
        authorizationUrl: string
        expires_at: string
      }>
    }
    const callback = (
      authorizationUrl: string,
      suffix = '&code=private-code',
    ) =>
      app.request(
        `${path}/callback?state=${new URL(authorizationUrl).searchParams.get('state')}${suffix}`,
        {},
        bindings,
        createExecutionContext(),
      )
    const channels = () =>
      db.query.userChannels.findMany({
        where: eq(TABLE.userChannels.user_id, user().id),
      })

    it('requires wallet auth for initiation, status and cancellation, and removes the legacy endpoint', async () => {
      for (const [route, method] of [
        ['/oauth', 'GET'],
        ['/oauth', 'POST'],
        [`/oauth/${crypto.randomUUID()}`, 'DELETE'],
      ]) {
        expect(
          (await app.request(`${path}${route}`, { method }, bindings)).status,
        ).toBe(401)
      }
      expect((await request('', 'POST')).status).toBe(404)
    })

    it('links without callback cookies or bearer tokens, with private status and no username', async () => {
      const attempt = await start()
      expect(attempt.authorizationUrl).not.toContain('Bearer')
      const status = await request('/oauth')
      expect(await status.json()).toEqual({
        attempt: {
          id: attempt.id,
          status: 'pending',
          expires_at: attempt.expires_at,
        },
      })
      expect(await (await request('/oauth', 'GET', 1)).json()).toEqual({
        attempt: null,
      })
      const response = await callback(attempt.authorizationUrl)
      expect(await response.text()).toContain('Telegram connected')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "default-src 'none'",
      )
      expect(await channels()).toMatchObject([
        { target: '987654321', status: 'verified', data: { name: 'Alice' } },
      ])
      const publicChannels = await app.request(
        '/notifications/channels',
        {
          headers: {
            Authorization: `Bearer ${await sign({ user_id: user().id, address: user().address }, bindings.JWT_SECRET)}`,
          },
        },
        bindings,
      )
      expect(await publicChannels.json()).toMatchObject([{ label: 'Alice' }])
      const saved = await db.query.telegramLoginAttempts.findFirst({
        where: eq(TABLE.telegramLoginAttempts.id, attempt.id),
      })
      expect(saved).toMatchObject({
        status: 'completed',
        code_verifier: null,
        nonce: null,
      })
      expect(await (await request('/oauth')).json()).toMatchObject({
        attempt: { status: 'completed' },
      })
    })

    it('allows only one callback to exchange the code under concurrent replay', async () => {
      const attempt = await start()
      const responses = await Promise.all([
        callback(attempt.authorizationUrl),
        callback(attempt.authorizationUrl),
      ])
      const pages = await Promise.all(responses.map((r) => r.text()))
      expect(
        pages.filter((page) => page.includes('<h1>Telegram connected</h1>')),
      ).toHaveLength(1)
      expect(provider.exchange).toHaveBeenCalledTimes(1)
      expect(provider.send).toHaveBeenCalledTimes(1)
      expect(await channels()).toHaveLength(1)
    })

    it('rolls back attempt completion when the channel insert fails', async () => {
      const attempt = await start()
      const state =
        new URL(attempt.authorizationUrl).searchParams.get('state') ?? ''
      const claimed = (
        await claimTelegramAttempt(
          db,
          (await digestParameter(state))._unsafeUnwrap(),
        )
      )._unsafeUnwrap()
      // PostgreSQL JSONB cannot encode NUL; this causes a real insert failure
      // without modifying shared schema, roles, or unrelated fixtures.
      const completed = await completeTelegramAttempt(db, attempt.id, {
        id: 987654321,
        name: '\u0000',
      })
      expect(completed._unsafeUnwrapErr()).toMatchObject({
        _tag: 'DATABASE_ERROR',
      })
      const saved = await db.query.telegramLoginAttempts.findFirst({
        where: eq(TABLE.telegramLoginAttempts.id, attempt.id),
      })
      expect(saved).toMatchObject({
        status: 'processing',
        code_verifier: claimed.code_verifier,
        nonce: claimed.nonce,
      })
      expect(await channels()).toHaveLength(0)
    })

    it('rejects forged, expired, cancelled and superseded state before exchanging', async () => {
      const first = await start()
      expect(
        (
          await callback(
            first.authorizationUrl.replace(
              /state=[^&]+/,
              `state=${'a'.repeat(43)}`,
            ),
          )
        ).status,
      ).toBe(200)
      await request(`/oauth/${first.id}`, 'DELETE', 1)
      expect(await (await request('/oauth')).json()).toMatchObject({
        attempt: { status: 'pending' },
      })
      await request(`/oauth/${first.id}`, 'DELETE')
      await callback(first.authorizationUrl)
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ created_at: new Date(Date.now() - 11_000) })
        .where(eq(TABLE.telegramLoginAttempts.id, first.id))
      const second = await start()
      await callback(first.authorizationUrl)
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ expires_at: new Date(Date.now() - 1) })
        .where(eq(TABLE.telegramLoginAttempts.id, second.id))
      await callback(second.authorizationUrl)
      expect(await (await request('/oauth')).json()).toMatchObject({
        attempt: { status: 'expired' },
      })
      expect(provider.exchange).not.toHaveBeenCalled()
      expect(await channels()).toHaveLength(0)
    })

    it('invalidates a still pending older authorization when starting a new attempt', async () => {
      const first = await start()
      expect((await request('/oauth', 'POST')).status).toBe(429)
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ created_at: new Date(Date.now() - 11_000) })
        .where(eq(TABLE.telegramLoginAttempts.id, first.id))
      const second = await start()
      await callback(first.authorizationUrl)
      expect(provider.exchange).not.toHaveBeenCalled()
      await callback(second.authorizationUrl)
      expect(await channels()).toHaveLength(1)
    })

    it('prevents cancellation during exchange from linking an account', async () => {
      const attempt = await start()
      provider.exchange.mockImplementationOnce(() =>
        fromPromise(
          (async () => {
            const cancelled = await cancelTelegramAttempt(
              db,
              user().id,
              attempt.id,
            )
            cancelled._unsafeUnwrap()
            return 'id-token'
          })(),
          (cause) =>
            new TelegramTokenExchangeError({ stage: 'request', cause }),
        ),
      )
      const response = await callback(attempt.authorizationUrl)
      expect(await response.text()).toContain('connection unsuccessful')
      expect(await channels()).toHaveLength(0)
      expect(await (await request('/oauth')).json()).toMatchObject({
        attempt: { status: 'cancelled' },
      })
    })

    it('prevents expired or replaced processing attempts from finalizing', async () => {
      const attempt = await start()
      const state =
        new URL(attempt.authorizationUrl).searchParams.get('state') ?? ''
      const claimed = (
        await claimTelegramAttempt(
          db,
          (await digestParameter(state))._unsafeUnwrap(),
        )
      )._unsafeUnwrap()
      expect(claimed.status).toBe('processing')
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({
          expires_at: new Date(Date.now() - 1),
          created_at: new Date(Date.now() - 11_000),
        })
        .where(eq(TABLE.telegramLoginAttempts.id, attempt.id))
      expect(
        (
          await completeTelegramAttempt(db, attempt.id, { id: 987654321 })
        )._unsafeUnwrapErr(),
      ).toMatchObject({
        _tag: 'TELEGRAM_ATTEMPT_UNAVAILABLE',
        stage: 'complete',
      })
      await start()
      expect(
        (
          await completeTelegramAttempt(db, attempt.id, { id: 987654321 })
        )._unsafeUnwrapErr(),
      ).toMatchObject({
        _tag: 'TELEGRAM_ATTEMPT_UNAVAILABLE',
        stage: 'complete',
      })
      expect(await channels()).toHaveLength(0)
    })

    it('cannot recreate a channel removed while its reconnect callback is processing', async () => {
      const [existing] = await db
        .insert(TABLE.userChannels)
        .values({
          user_id: user().id,
          channel: 'telegram',
          target: '987654321',
          data: {},
          status: 'disabled',
          verified_at: new Date(),
        })
        .returning()
      if (!existing) throw new Error('Missing fixture channel')
      const attempt = await start()
      provider.exchange.mockImplementationOnce(() =>
        fromPromise(
          (async () => {
            const bearer = await sign(
              { user_id: user().id, address: user().address },
              bindings.JWT_SECRET,
            )
            const removed = await app.request(
              `/notifications/channels/${existing.id}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${bearer}` },
              },
              bindings,
              createExecutionContext(),
            )
            expect(removed.status).toBe(200)
            return 'id-token'
          })(),
          (cause) =>
            new TelegramTokenExchangeError({ stage: 'request', cause }),
        ),
      )
      expect(await (await callback(attempt.authorizationUrl)).text()).toContain(
        'connection unsuccessful',
      )
      expect(await channels()).toHaveLength(0)
      expect(await (await request('/oauth')).json()).toMatchObject({
        attempt: { status: 'cancelled' },
      })
    })

    it.each(['access_denied', 'exchange', 'identity', 'delivery'])(
      'rejects %s without creating channels or exposing provider errors',
      async (failure) => {
        const attempt = await start()
        if (failure === 'exchange')
          provider.exchange.mockReturnValueOnce(
            errAsync(
              new TelegramTokenExchangeError({
                stage: 'request',
                cause: new Error('secret-token'),
              }),
            ),
          )
        if (failure === 'identity')
          provider.verify.mockReturnValueOnce(
            errAsync(
              new TelegramIdentityError({
                stage: 'verification',
                cause: new Error('secret-token'),
              }),
            ),
          )
        if (failure === 'delivery')
          provider.send.mockReturnValueOnce(
            errAsync({ code: 'TELEGRAM_API_REQUEST_ERROR', errorCode: 403 }),
          )
        const response = await callback(
          attempt.authorizationUrl,
          failure === 'access_denied'
            ? '&error=access_denied&error_description=secret-token'
            : '&code=private-code',
        )
        const page = await response.text()
        expect(page).toContain('connection unsuccessful')
        expect(page).not.toContain('secret-token')
        expect(page).not.toContain('private-code')
        expect(await channels()).toHaveLength(0)
        const saved = await db.query.telegramLoginAttempts.findFirst({
          where: eq(TABLE.telegramLoginAttempts.id, attempt.id),
        })
        expect(saved).toMatchObject({
          status: 'failed',
          code_verifier: null,
          nonce: null,
        })
      },
    )

    it('reconnects the exact existing channel without changing preferences or another wallet', async () => {
      const rows = await db
        .insert(TABLE.userChannels)
        .values(
          users.map((u) => ({
            user_id: u.id,
            channel: 'telegram' as const,
            target: '987654321',
            data: { username: 'old' },
            status: 'disabled' as const,
            status_reason: 'FORBIDDEN_BY_TELEGRAM',
            verified_at: new Date(),
          })),
        )
        .returning()
      await db
        .insert(TABLE.userNotificationSettings)
        .values({ user_id: user().id, owned_name_expiry: true })
      const attempt = await start()
      await callback(attempt.authorizationUrl)
      expect(await channels()).toMatchObject([
        { id: rows[0]?.id, status: 'verified', status_reason: null },
      ])
      const other = await db.query.userChannels.findFirst({
        where: eq(TABLE.userChannels.user_id, user(1).id),
      })
      expect(other).toMatchObject({ id: rows[1]?.id, status: 'disabled' })
      const preferences = await db.query.userNotificationSettings.findFirst({
        where: eq(TABLE.userNotificationSettings.user_id, user().id),
      })
      expect(preferences?.owned_name_expiry).toBe(true)
    })

    it.each([
      [403, 'Forbidden: bot was blocked by the user', 'disabled'],
      [400, 'Bad Request: chat not found', 'disabled'],
      [500, 'Internal Server Error', 'verified'],
    ])(
      'preserves a linked channel and updates availability after Telegram %s',
      async (errorCode, message, expectedStatus) => {
        const [existing] = await db
          .insert(TABLE.userChannels)
          .values({
            user_id: user().id,
            channel: 'telegram',
            target: '987654321',
            status: 'verified',
            data: {},
            verified_at: new Date(),
          })
          .returning()
        const attempt = await start()
        provider.send.mockReturnValueOnce(
          errAsync({ code: 'TELEGRAM_API_REQUEST_ERROR', errorCode, message }),
        )
        await callback(attempt.authorizationUrl)
        expect(await channels()).toMatchObject([
          { id: existing?.id, status: expectedStatus },
        ])
      },
    )

    it('keeps a new attempt bound to the configured callback even with a forged Host header', async () => {
      const response = await request(
        '/oauth',
        'POST',
        0,
        'https://attacker.example',
      )
      expect(response.status).toBe(200)
      const attempt = (await response.json()) as {
        id: string
        authorizationUrl: string
      }
      expect(
        new URL(attempt.authorizationUrl).searchParams.get('redirect_uri'),
      ).toBe(`${bindings.BASE_URL}${path}/callback`)
      expect(provider.exchange).not.toHaveBeenCalled()
      expect(
        await db.query.telegramLoginAttempts.findMany({
          where: and(
            eq(TABLE.telegramLoginAttempts.user_id, user().id),
            eq(TABLE.telegramLoginAttempts.id, attempt.id),
          ),
        }),
      ).toHaveLength(1)
    })

    it('ignores a delayed messaging refusal from a superseded callback', async () => {
      const first = await start()
      const state =
        new URL(first.authorizationUrl).searchParams.get('state') ?? ''
      const claimed = (
        await claimTelegramAttempt(
          db,
          (await digestParameter(state))._unsafeUnwrap(),
        )
      )._unsafeUnwrap()
      expect(claimed.status).toBe('processing')
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ created_at: new Date(Date.now() - 11_000) })
        .where(eq(TABLE.telegramLoginAttempts.id, first.id))
      const second = await start()
      await callback(second.authorizationUrl)
      const refusal = await handleTelegramMessagingRefusal(
        db,
        first.id,
        '987654321',
        {
          code: 'TELEGRAM_API_REQUEST_ERROR',
          errorCode: 403,
        },
      )
      expect(refusal.isOk()).toBe(true)
      expect(await channels()).toMatchObject([{ status: 'verified' }])
      expect(await (await request('/oauth')).json()).toMatchObject({
        attempt: { id: second.id, status: 'completed' },
      })
    })
  },
)
