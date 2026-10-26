import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { sign } from 'hono/jwt'
import { okAsync } from 'neverthrow'
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
  failTelegramAttempt,
  getTelegramAttempt,
  handleTelegramMessagingRefusal,
  removeTelegramChannel,
  saveTelegramAttempt,
} from './attempts.js'
import {
  createTelegramAuthorization,
  digestParameter,
  exchangeTelegramCode,
  verifyTelegramIdToken,
} from './oidc.js'
import { makeTelegramRequest } from './utils.js'

vi.mock('./oidc.js', async (original) => ({
  ...(await original<typeof import('./oidc.js')>()),
  exchangeTelegramCode: vi.fn(),
  verifyTelegramIdToken: vi.fn(),
}))
vi.mock('./utils.js', async (original) => ({
  ...(await original<typeof import('./utils.js')>()),
  makeTelegramRequest: vi.fn(),
}))
const provider = {
  exchange: vi.mocked(exchangeTelegramCode),
  verify: vi.mocked(verifyTelegramIdToken),
  send: vi.mocked(makeTelegramRequest),
}

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
      provider.send.mockReset().mockReturnValue(
        okAsync({
          message_id: 1,
          date: 0,
          chat: { id: 987654321, type: 'private' },
        }),
      )
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
    const savePending = async () => {
      const redirectUri = `${bindings.BASE_URL}${path}/callback`
      const auth = (
        await createTelegramAuthorization('123456', redirectUri)
      )._unsafeUnwrap()
      const id = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 600_000)
      return saveTelegramAttempt(db, {
        id,
        user_id: user().id,
        status: 'pending',
        state_digest: auth.stateDigest,
        code_verifier: auth.codeVerifier,
        nonce: auth.nonce,
        redirect_uri: redirectUri,
        created_at: new Date(),
        expires_at: expiresAt,
      }).map(() => ({
        id,
        authorizationUrl: auth.authorizationUrl,
        expires_at: expiresAt.toISOString(),
      }))
    }
    const start = async () => (await savePending())._unsafeUnwrap()
    const claim = async (authorizationUrl: string) =>
      claimTelegramAttempt(
        db,
        (
          await digestParameter(
            new URL(authorizationUrl).searchParams.get('state') ?? '',
          )
        )._unsafeUnwrap(),
      )
    const complete = async (authorizationUrl: string) => {
      const attempt = await claim(authorizationUrl)
      if (attempt.isErr()) return attempt
      return completeTelegramAttempt(db, attempt.value.id, {
        id: 987654321,
        name: 'Alice',
      })
    }
    const channels = () =>
      db.query.userChannels.findMany({
        where: eq(TABLE.userChannels.user_id, user().id),
      })

    it('links without callback cookies or bearer tokens, with private status and no username', async () => {
      const initiated = await request(
        '/oauth',
        'POST',
        0,
        'https://attacker.example',
      )
      expect(initiated.status).toBe(200)
      const attempt = (await initiated.json()) as {
        id: string
        authorizationUrl: string
        expires_at: string
      }
      expect(
        new URL(attempt.authorizationUrl).searchParams.get('redirect_uri'),
      ).toBe(`${bindings.BASE_URL}${path}/callback`)
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
      const response = await app.request(
        `${path}/callback?state=${new URL(attempt.authorizationUrl).searchParams.get('state')}&code=private-code`,
        {},
        bindings,
        createExecutionContext(),
      )
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
      expect(provider.exchange).toHaveBeenCalledOnce()
      expect(provider.send).toHaveBeenCalledOnce()
    })

    it('allows only one concurrent claim and consumes completion once', async () => {
      const attempt = await start()
      const results = await Promise.all([
        claim(attempt.authorizationUrl),
        claim(attempt.authorizationUrl),
      ])
      expect(results.filter((result) => result.isOk())).toHaveLength(1)
      expect(results.filter((result) => result.isErr())).toHaveLength(1)
      expect(
        (
          await completeTelegramAttempt(db, attempt.id, { id: 987654321 })
        ).isOk(),
      ).toBe(true)
      expect(
        (
          await completeTelegramAttempt(db, attempt.id, { id: 987654321 })
        )._unsafeUnwrapErr(),
      ).toMatchObject({ _tag: 'TELEGRAM_ATTEMPT_UNAVAILABLE' })
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

    it('rejects forged, expired, cancelled and superseded state, with wallet-owned cancellation', async () => {
      const first = await start()
      expect(
        (
          await claim(
            first.authorizationUrl.replace(
              /state=[^&]+/,
              `state=${'a'.repeat(43)}`,
            ),
          )
        ).isErr(),
      ).toBe(true)
      ;(await cancelTelegramAttempt(db, user(1).id, first.id))._unsafeUnwrap()
      expect(
        (await getTelegramAttempt(db, user().id))._unsafeUnwrap(),
      ).toMatchObject({ status: 'pending' })
      ;(await cancelTelegramAttempt(db, user().id, first.id))._unsafeUnwrap()
      expect((await claim(first.authorizationUrl)).isErr()).toBe(true)
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ created_at: new Date(Date.now() - 11_000) })
        .where(eq(TABLE.telegramLoginAttempts.id, first.id))
      const second = await start()
      expect((await claim(first.authorizationUrl)).isErr()).toBe(true)
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ expires_at: new Date(Date.now() - 1) })
        .where(eq(TABLE.telegramLoginAttempts.id, second.id))
      expect((await claim(second.authorizationUrl)).isErr()).toBe(true)
      expect(
        (await getTelegramAttempt(db, user().id))._unsafeUnwrap(),
      ).toMatchObject({ status: 'expired' })
      expect(await channels()).toHaveLength(0)
    })

    it('throttles replacement and invalidates the older pending state', async () => {
      const first = await start()
      expect((await savePending())._unsafeUnwrapErr()).toMatchObject({
        _tag: 'TELEGRAM_ATTEMPT_THROTTLED',
      })
      await db
        .update(TABLE.telegramLoginAttempts)
        .set({ created_at: new Date(Date.now() - 11_000) })
        .where(eq(TABLE.telegramLoginAttempts.id, first.id))
      const second = await start()
      expect((await complete(first.authorizationUrl)).isErr()).toBe(true)
      expect((await complete(second.authorizationUrl)).isOk()).toBe(true)
      expect(await channels()).toHaveLength(1)
    })

    it('prevents a cancelled processing attempt from linking an account', async () => {
      const attempt = await start()
      ;(await claim(attempt.authorizationUrl))._unsafeUnwrap()
      ;(await cancelTelegramAttempt(db, user().id, attempt.id))._unsafeUnwrap()
      expect(
        (
          await completeTelegramAttempt(db, attempt.id, { id: 987654321 })
        )._unsafeUnwrapErr(),
      ).toMatchObject({ _tag: 'TELEGRAM_ATTEMPT_UNAVAILABLE' })
      ;(await failTelegramAttempt(db, attempt.id))._unsafeUnwrap()
      expect(await channels()).toHaveLength(0)
      expect(
        (await getTelegramAttempt(db, user().id))._unsafeUnwrap(),
      ).toMatchObject({ status: 'cancelled' })
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

    it('cannot recreate a removed channel from a processing attempt', async () => {
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
      ;(await claim(attempt.authorizationUrl))._unsafeUnwrap()
      ;(await removeTelegramChannel(db, user().id, existing.id))._unsafeUnwrap()
      expect(
        (
          await completeTelegramAttempt(db, attempt.id, { id: 987654321 })
        ).isErr(),
      ).toBe(true)
      expect(await channels()).toHaveLength(0)
      expect(
        (await getTelegramAttempt(db, user().id))._unsafeUnwrap(),
      ).toMatchObject({ status: 'cancelled' })
    })

    it('records terminal failure and clears credentials without creating a channel', async () => {
      const attempt = await start()
      ;(await claim(attempt.authorizationUrl))._unsafeUnwrap()
      ;(await failTelegramAttempt(db, attempt.id))._unsafeUnwrap()
      expect(await channels()).toHaveLength(0)
      const saved = await db.query.telegramLoginAttempts.findFirst({
        where: eq(TABLE.telegramLoginAttempts.id, attempt.id),
      })
      expect(saved).toMatchObject({
        status: 'failed',
        code_verifier: null,
        nonce: null,
      })
    })

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
      ;(await complete(attempt.authorizationUrl))._unsafeUnwrap()
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
      'updates availability only for a current permanent messaging refusal: %s',
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
        ;(await claim(attempt.authorizationUrl))._unsafeUnwrap()
        ;(
          await handleTelegramMessagingRefusal(db, attempt.id, '987654321', {
            code: 'TELEGRAM_API_REQUEST_ERROR',
            errorCode,
            message,
          })
        )._unsafeUnwrap()
        expect(await channels()).toMatchObject([
          { id: existing?.id, status: expectedStatus },
        ])
      },
    )

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
      ;(await complete(second.authorizationUrl))._unsafeUnwrap()
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
      expect(
        (await getTelegramAttempt(db, user().id))._unsafeUnwrap(),
      ).toMatchObject({ id: second.id, status: 'completed' })
    })
  },
)
