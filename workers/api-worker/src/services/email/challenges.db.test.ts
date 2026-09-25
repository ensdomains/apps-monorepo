import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { sign } from 'hono/jwt'
import { err, errAsync, ok, okAsync } from 'neverthrow'
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

const sendVerificationEmail = vi.hoisted(() => vi.fn())
const verifyTelegramAuth = vi.hoisted(() => vi.fn())
const makeTelegramRequest = vi.hoisted(() => vi.fn())
vi.mock('#services/email/verification.js', () => ({ sendVerificationEmail }))
vi.mock('#services/telegram/auth.js', () => ({ verifyTelegramAuth }))
vi.mock('#services/telegram/utils.js', () => ({
  makeTelegramRequest,
  createInlineKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
}))
vi.mock('#services/email/welcome.js', () => ({
  sendWelcomeEmail: vi.fn(async () => ok(undefined)),
}))
vi.mock('#services/sendgrid/contacts.js', () => ({
  addContactToList: vi.fn(async () => ok(undefined)),
  searchContact: vi.fn(async () => ok(null)),
  deleteContact: vi.fn(async () => ok(undefined)),
}))

const testEnv = env as CloudflareBindings & {
  RUN_REAL_DB_TESTS: string
  REAL_DB_DATABASE_URL: string
}

describe.skipIf(testEnv.RUN_REAL_DB_TESTS !== '1')(
  'email challenge persistence and routes',
  () => {
    let db: Database
    let bindings: CloudflareBindings
    let users: { id: string; address: string }[] = []
    let kv: Map<string, string>

    beforeAll(() => {
      const url = requireLocalTestDatabase(
        testEnv.RUN_REAL_DB_TESTS,
        testEnv.REAL_DB_DATABASE_URL,
      )
      bindings = makeMockEnv({
        ...env,
        DATABASE_URL: url,
        JWT_SECRET: 'email-db-test-secret',
        SENDGRID_API_KEY: 'never-sent',
        SENDGRID_BROADCAST_LIST_ID: '',
        TELEGRAM_WEBHOOK_SECRET: 'telegram-test-secret',
      })
      db = getDatabase(bindings)
    })

    beforeEach(async () => {
      users = Array.from({ length: 2 }, () => ({
        id: crypto.randomUUID(),
        address: `0x${crypto.randomUUID().replaceAll('-', '')}`,
      }))
      await db.insert(TABLE.users).values(users)
      kv = new Map()
      bindings = {
        ...bindings,
        KV: {
          get: async (key: string) => kv.get(key) ?? null,
          put: async (key: string, value: string) => {
            kv.set(key, value)
          },
        } as unknown as KVNamespace,
      }
      sendVerificationEmail
        .mockReset()
        .mockImplementation(async () => ok({ statusCode: 202 }))
      verifyTelegramAuth
        .mockReset()
        .mockReturnValue(Promise.resolve(ok(undefined)))
      makeTelegramRequest.mockReset().mockReturnValue(okAsync({}))
    })

    afterEach(async () => {
      requireLocalTestDatabase(testEnv.RUN_REAL_DB_TESTS, bindings.DATABASE_URL)
      await db.delete(TABLE.users).where(
        inArray(
          TABLE.users.id,
          users.map((user) => user.id),
        ),
      )
    })

    const firstUserId = () => {
      const user = users[0]
      if (!user) throw new Error('Missing first test user')
      return user.id
    }

    const request = async (
      userIndex: number | null,
      path: string,
      method = 'GET',
      body?: object,
    ) => {
      const user = userIndex === null ? null : users[userIndex]
      const token =
        user &&
        (await sign(
          {
            user_id: user.id,
            address: user.address,
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          bindings.JWT_SECRET,
          'HS256',
        ))
      return app.request(
        `/notifications${path}`,
        {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
        bindings,
        createExecutionContext(),
      )
    }

    it('binds OTP to the requester, rotates it, and establishes independently shared email channels', async () => {
      const email = `${crypto.randomUUID()}@example.com`
      const started = await request(0, '/channels/email', 'POST', { email })
      expect(started.status).toBe(200)
      const { challengeId } = (await started.json()) as { challengeId: string }
      const oldOtp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      expect(oldOtp).toMatch(/^\d{6}$/)

      const pending = (await (await request(0, '/channels')).json()) as Array<{
        id: string
        channel: string
        status: string
        label: string
      }>
      expect(pending).toContainEqual(
        expect.objectContaining({
          id: challengeId,
          channel: 'email',
          status: 'pending',
          label: email,
        }),
      )
      expect(
        await db.query.userChannels.findFirst({
          where: eq(TABLE.userChannels.user_id, firstUserId()),
        }),
      ).toBeUndefined()

      expect(
        (
          await request(null, `/channels/email/${challengeId}/verify`, 'POST', {
            otp: oldOtp,
          })
        ).status,
      ).toBe(401)

      expect(
        (
          await request(1, `/channels/email/${challengeId}/verify`, 'POST', {
            otp: oldOtp,
          })
        ).status,
      ).toBe(400)
      expect(
        (await request(1, `/channels/email/${challengeId}`, 'DELETE')).status,
      ).toBe(404)

      const resent = await request(
        0,
        `/channels/email/${challengeId}/resend`,
        'POST',
      )
      expect(resent.status).toBe(200)
      expect(
        ((await resent.json()) as { challengeId: string }).challengeId,
      ).toBe(challengeId)
      const newOtp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      expect(newOtp).not.toBe(oldOtp)
      expect(
        await db.query.emailVerifications.findMany({
          where: eq(TABLE.emailVerifications.user_id, firstUserId()),
        }),
      ).toHaveLength(1)
      expect(
        (
          await request(0, `/channels/email/${challengeId}/verify`, 'POST', {
            otp: oldOtp,
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await request(0, `/channels/email/${challengeId}/verify`, 'POST', {
            otp: newOtp,
          })
        ).status,
      ).toBe(200)
      expect(
        await db.query.emailVerifications.findFirst({
          where: eq(TABLE.emailVerifications.user_id, firstUserId()),
        }),
      ).toBeUndefined()
      expect((await request(0, '/channels')).status).toBe(200)
      expect(
        (
          (await (await request(0, '/channels')).json()) as Array<{
            status: string
          }>
        ).some((c) => c.status === 'pending'),
      ).toBe(false)

      const otherStart = await request(1, '/channels/email', 'POST', { email })
      expect(otherStart.status).toBe(started.status)
      const otherId = ((await otherStart.json()) as { challengeId: string })
        .challengeId
      const otherOtp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      expect(
        (
          await request(1, `/channels/email/${otherId}/verify`, 'POST', {
            otp: otherOtp,
          })
        ).status,
      ).toBe(200)
      const channels = await db.query.userChannels.findMany({
        where: eq(TABLE.userChannels.target, email),
      })
      expect(channels).toHaveLength(2)
      expect(new Set(channels.map((channel) => channel.user_id))).toEqual(
        new Set(users.map((user) => user.id)),
      )
    })

    it('keeps an expired pending email visible and lets resend refresh and redeem it', async () => {
      const email = `${crypto.randomUUID()}@example.com`
      const started = await request(0, '/channels/email', 'POST', { email })
      expect(started.status).toBe(200)
      const { challengeId } = (await started.json()) as { challengeId: string }
      const oldOtp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      const expiredAt = new Date(Date.now() - 60_000)
      await db
        .update(TABLE.emailVerifications)
        .set({ expires_at: expiredAt })
        .where(eq(TABLE.emailVerifications.id, challengeId))

      const pendingResponse = await request(0, '/channels')
      expect(pendingResponse.status).toBe(200)
      const pending = (await pendingResponse.json()) as Array<{
        id: string
        channel: string
        status: string
        label: string
        expires_at?: string
      }>
      expect(pending).toContainEqual(
        expect.objectContaining({
          id: challengeId,
          channel: 'email',
          status: 'pending',
          label: email,
          expires_at: expiredAt.toISOString(),
        }),
      )

      const resent = await request(
        0,
        `/channels/email/${challengeId}/resend`,
        'POST',
      )
      expect(resent.status).toBe(200)
      expect(
        ((await resent.json()) as { challengeId: string }).challengeId,
      ).toBe(challengeId)
      const newOtp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      expect(newOtp).not.toBe(oldOtp)
      const refreshed = await db.query.emailVerifications.findFirst({
        where: eq(TABLE.emailVerifications.id, challengeId),
      })
      expect(refreshed?.expires_at.getTime()).toBeGreaterThan(Date.now())
      expect(refreshed?.send_count).toBe(1)
      expect(
        (
          await request(0, `/channels/email/${challengeId}/verify`, 'POST', {
            otp: oldOtp,
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await request(0, `/channels/email/${challengeId}/verify`, 'POST', {
            otp: newOtp,
          })
        ).status,
      ).toBe(200)
      expect(
        await db.query.emailVerifications.findFirst({
          where: eq(TABLE.emailVerifications.id, challengeId),
        }),
      ).toBeUndefined()
      expect(
        await db.query.userChannels.findFirst({
          where: eq(TABLE.userChannels.user_id, firstUserId()),
        }),
      ).toEqual(
        expect.objectContaining({
          channel: 'email',
          target: email,
          status: 'verified',
        }),
      )
    })

    it('does not mutate a challenge or send mail after the caller limit is reached', async () => {
      const email = `${crypto.randomUUID()}@example.com`
      const started = await request(0, '/channels/email', 'POST', { email })
      const challengeId = ((await started.json()) as { challengeId: string })
        .challengeId
      for (let i = 0; i < 2; i++) {
        expect(
          (await request(0, `/channels/email/${challengeId}/resend`, 'POST'))
            .status,
        ).toBe(200)
      }
      const before = await db.query.emailVerifications.findFirst({
        where: eq(TABLE.emailVerifications.user_id, firstUserId()),
      })
      const sentBefore = sendVerificationEmail.mock.calls.length
      expect(
        (await request(0, `/channels/email/${challengeId}/resend`, 'POST'))
          .status,
      ).toBe(429)
      const after = await db.query.emailVerifications.findFirst({
        where: eq(TABLE.emailVerifications.user_id, firstUserId()),
      })
      expect(after).toEqual(before)
      expect(sendVerificationEmail).toHaveBeenCalledTimes(sentBefore)
      expect(
        (
          await request(0, '/channels/email', 'POST', {
            email: `${crypto.randomUUID()}@example.com`,
          })
        ).status,
      ).toBe(429)
      expect(
        await db.query.emailVerifications.findMany({
          where: eq(TABLE.emailVerifications.user_id, firstUserId()),
        }),
      ).toEqual([before])
      expect(sendVerificationEmail).toHaveBeenCalledTimes(sentBefore)
      expect(
        (await request(1, '/channels/email', 'POST', { email })).status,
      ).toBe(200)
    })

    it('locks a challenge after five incorrect attempts', async () => {
      const started = await request(0, '/channels/email', 'POST', {
        email: `${crypto.randomUUID()}@example.com`,
      })
      const challengeId = ((await started.json()) as { challengeId: string })
        .challengeId
      const otp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      const wrong = otp === '000000' ? '000001' : '000000'
      for (let i = 0; i < 5; i++) {
        expect(
          (
            await request(0, `/channels/email/${challengeId}/verify`, 'POST', {
              otp: wrong,
            })
          ).status,
        ).toBe(400)
      }
      expect(
        (
          await request(0, `/channels/email/${challengeId}/verify`, 'POST', {
            otp,
          })
        ).status,
      ).toBe(400)
      const challenge = await db.query.emailVerifications.findFirst({
        where: eq(TABLE.emailVerifications.id, challengeId),
      })
      expect(challenge?.attempts).toBe(5)
      expect(
        await db.query.userChannels.findFirst({
          where: eq(TABLE.userChannels.user_id, firstUserId()),
        }),
      ).toBeUndefined()
    })

    it('consumes a valid challenge once under concurrent redemption', async () => {
      const email = `${crypto.randomUUID()}@example.com`
      const started = await request(0, '/channels/email', 'POST', { email })
      const challengeId = ((await started.json()) as { challengeId: string })
        .challengeId
      const otp = sendVerificationEmail.mock.calls.at(-1)?.[3] as string
      const responses = await Promise.all([
        request(0, `/channels/email/${challengeId}/verify`, 'POST', { otp }),
        request(0, `/channels/email/${challengeId}/verify`, 'POST', { otp }),
      ])
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 400,
      ])
      const channels = await db.query.userChannels.findMany({
        where: eq(TABLE.userChannels.target, email),
      })
      expect(channels).toHaveLength(1)
      expect(channels[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    })

    it('does not disclose existing ownership or recipient-specific provider rejection on initiation', async () => {
      const linkedEmail = `${crypto.randomUUID()}@example.com`
      await db.insert(TABLE.userChannels).values({
        user_id: firstUserId(),
        channel: 'email',
        target: linkedEmail,
        status: 'verified',
      })
      sendVerificationEmail.mockImplementation(async () =>
        err(new Error('recipient suppressed')),
      )

      const linked = await request(1, '/channels/email', 'POST', {
        email: linkedEmail,
      })
      const unused = await request(1, '/channels/email', 'POST', {
        email: `${crypto.randomUUID()}@example.com`,
      })
      expect(linked.status).toBe(200)
      expect(unused.status).toBe(200)
      const linkedBody = (await linked.json()) as Record<string, unknown>
      const unusedBody = (await unused.json()) as Record<string, unknown>
      expect(Object.keys(linkedBody).sort()).toEqual(
        Object.keys(unusedBody).sort(),
      )
      expect(linkedBody.message).toBe(unusedBody.message)
      expect(sendVerificationEmail).toHaveBeenCalledTimes(2)
    })

    it('keeps Telegram associated but unavailable after 403 and restores it on /start', async () => {
      const telegramId = Math.floor(Math.random() * 1_000_000_000)
      makeTelegramRequest.mockReturnValueOnce(
        errAsync({ code: 'TELEGRAM_API_REQUEST_ERROR', errorCode: 403 }),
      )
      const connected = await request(0, '/channels/telegram', 'POST', {
        auth_data: {
          id: telegramId,
          username: `test_${telegramId}`,
          auth_date: Math.floor(Date.now() / 1000),
          hash: 'validated-by-test',
        },
      })
      expect(connected.status).toBe(200)
      const channel = await db.query.userChannels.findFirst({
        where: eq(TABLE.userChannels.user_id, firstUserId()),
      })
      expect(channel).toMatchObject({
        channel: 'telegram',
        status: 'disabled',
        status_reason: 'FORBIDDEN_BY_TELEGRAM',
      })
      expect(channel?.verified_at).toBeInstanceOf(Date)
      if (!channel) throw new Error('Telegram channel was not created')

      const started = await app.request(
        '/webhook/telegram/update',
        {
          method: 'POST',
          headers: {
            'X-Telegram-Bot-Api-Secret-Token': bindings.TELEGRAM_WEBHOOK_SECRET,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { text: '/start', from: { id: telegramId } },
          }),
        },
        bindings,
        createExecutionContext(),
      )
      expect(started.status).toBe(200)
      const restored = await db.query.userChannels.findFirst({
        where: eq(TABLE.userChannels.id, channel.id),
      })
      expect(restored).toMatchObject({
        status: 'verified',
        status_reason: null,
      })
    })
  },
)
