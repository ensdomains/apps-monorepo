import { env } from 'cloudflare:workers'
import { eq, inArray, sql } from 'drizzle-orm'
import { sign } from 'hono/jwt'
import { ok } from 'neverthrow'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import pushApp from '#app/routes/notifications/channels/push.js'
import { type Database, getDatabase, TABLE } from '#core/database/index.js'
import { makeMockEnv, makeMockQueue } from '#test-utils/env.js'
import { runQueue } from '#test-utils/queue.js'
import { requireLocalTestDatabase } from '#test-utils/real-db-config.js'
import type { BaseDeliveryJob } from '#types/delivery.js'
import type { ExpiryEvent } from '#types/events/index.js'
import {
  buildIdempotencyKey,
  DATABASE_WRITE_BATCH_SIZE,
  QUEUE_BATCH_SIZE,
  RECIPIENT_PAGE_SIZE,
} from './event-ingestion.js'

// Providers are the only external side effects permitted, even in this suite.
const sendMail = vi.hoisted(() => vi.fn())
vi.mock('#services/email/utils.js', () => ({ sendMailV3: sendMail }))
vi.mock('#services/telegram/utils.js', () => ({
  makeTelegramRequest: vi.fn(() => {
    throw new Error('Unexpected Telegram call')
  }),
  createInlineKeyboard: vi.fn(),
}))
vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: vi.fn(() => {
    throw new Error('Unexpected push call')
  }),
}))

const testEnv = env as CloudflareBindings & {
  RUN_REAL_DB_TESTS: string
  REAL_DB_DATABASE_URL: string
}

describe.skipIf(testEnv.RUN_REAL_DB_TESTS !== '1')(
  'real local Neon HTTP persistence',
  () => {
    let db: Database
    let bindings: CloudflareBindings
    let users: { id: string; address: string }[] = []
    let event: ExpiryEvent
    let email: ReturnType<typeof makeMockQueue<BaseDeliveryJob>>

    beforeAll(() => {
      const url = requireLocalTestDatabase(
        testEnv.RUN_REAL_DB_TESTS,
        testEnv.REAL_DB_DATABASE_URL,
      )
      bindings = makeMockEnv({
        ...env,
        DATABASE_URL: url,
        JWT_SECRET: 'local-db-test-secret',
        SENDGRID_API_KEY: 'never-sent',
      })
      db = getDatabase(bindings)
    })

    beforeEach(() => {
      users = []
      email = makeMockQueue<BaseDeliveryJob>()
      bindings = { ...bindings, EMAIL_QUEUE: email as Queue }
      event = {
        type: 'name_expiring',
        name: `${crypto.randomUUID()}.eth`,
        expiryDate: 1700000000,
        stage: '7d',
        includeFavorites: false,
      }
      sendMail.mockReset().mockReturnValue(ok({ statusCode: 202 }))
    })

    afterEach(async () => {
      // Delete only this test's UUIDs, cascading their fixtures. No truncation,
      // schema reset or cleanup of other local users, even after a failed test.
      requireLocalTestDatabase(testEnv.RUN_REAL_DB_TESTS, bindings.DATABASE_URL)
      if (users.length)
        await db.delete(TABLE.users).where(
          inArray(
            TABLE.users.id,
            users.map((user) => user.id),
          ),
        )
    })

    const seedRecipients = async (count: number) => {
      users = Array.from({ length: count }, () => ({
        id: crypto.randomUUID(),
        address: `0x${crypto.randomUUID().replaceAll('-', '')}`,
      }))
      await db.insert(TABLE.users).values(users)
      await db.insert(TABLE.userNotificationSettings).values(
        users.map((user, index) => ({
          user_id: user.id,
          owned_name_expiry: true,
          favourited_name_expiry: index !== 0,
        })),
      )
      await db.insert(TABLE.userChannels).values(
        users.map((user) => ({
          user_id: user.id,
          channel: 'email' as const,
          target: `${user.id}@example.com`,
          status: 'verified' as const,
        })),
      )
      event = { ...event, owner: users[0]?.address }
    }

    const state = async () => {
      const notifications = await db.query.notifications.findMany({
        where: inArray(
          TABLE.notifications.user_id,
          users.map((user) => user.id),
        ),
      })
      const deliveries = notifications.length
        ? await db.query.notificationDeliveries.findMany({
            where: inArray(
              TABLE.notificationDeliveries.notification_id,
              notifications.map((row) => row.id),
            ),
          })
        : []
      return { notifications, deliveries }
    }

    const assertNoDuplicateGroups = async () => {
      const userIds = users.map((user) => user.id)
      const notificationDuplicates = await db
        .select({ key: TABLE.notifications.idempotency_key })
        .from(TABLE.notifications)
        .where(inArray(TABLE.notifications.user_id, userIds))
        .groupBy(TABLE.notifications.idempotency_key)
        .having(sql`count(*) > 1`)
      const deliveryDuplicates = await db
        .select({ id: TABLE.notificationDeliveries.notification_id })
        .from(TABLE.notificationDeliveries)
        .innerJoin(
          TABLE.notifications,
          eq(
            TABLE.notifications.id,
            TABLE.notificationDeliveries.notification_id,
          ),
        )
        .where(inArray(TABLE.notifications.user_id, userIds))
        .groupBy(
          TABLE.notificationDeliveries.notification_id,
          TABLE.notificationDeliveries.channel,
          TABLE.notificationDeliveries.target,
        )
        .having(sql`count(*) > 1`)
      expect(notificationDuplicates).toEqual([])
      expect(deliveryDuplicates).toEqual([])
    }

    it('pages 501 favorites with owner precedence and handles multi-chunk channel fanout', async () => {
      await seedRecipients(RECIPIENT_PAGE_SIZE + 1)
      const owner = users[0]
      if (!owner) throw new Error('Missing fixture owner')
      // The owner alone exceeds a delivery write chunk; favorites independently
      // exceed a recipient page. Both branches use real SQL and persisted IDs.
      await db.insert(TABLE.userChannels).values(
        Array.from({ length: DATABASE_WRITE_BATCH_SIZE }, (_, index) => ({
          user_id: owner.id,
          channel: 'email' as const,
          target: `extra-${index}@example.com`,
          status: 'verified' as const,
        })),
      )
      const deliveryCount = users.length + DATABASE_WRITE_BATCH_SIZE
      await db
        .insert(TABLE.favorites)
        .values(users.map((user) => ({ user_id: user.id, name: event.name })))
      const result = await runQueue(
        'app-api-worker-event-ingestion',
        [{ ...event, includeFavorites: true }],
        bindings,
      )
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(result.retryMessages).toEqual([])
      const { notifications, deliveries } = await state()
      expect(notifications).toHaveLength(users.length)
      expect(deliveries).toHaveLength(deliveryCount)
      for (const notification of notifications)
        expect(notification.payload).toMatchObject({
          watchReason:
            notification.user_id === users[0]?.id ? 'owned' : 'favourited',
        })
      expect(
        notifications.filter((row) => row.user_id === users[0]?.id),
      ).toHaveLength(1)
      expect(email.sendBatch.mock.calls.flatMap(([jobs]) => jobs)).toHaveLength(
        deliveryCount,
      )
      expect(
        email.sendBatch.mock.calls.every(
          ([jobs]) => jobs.length <= QUEUE_BATCH_SIZE,
        ),
      ).toBe(true)
      await assertNoDuplicateGroups()
    })

    it('repairs a durable notification with no delivery, independent of the original batch', async () => {
      await seedRecipients(1)
      const owner = users[0]
      if (!owner) throw new Error('Missing fixture owner')
      const notificationId = crypto.randomUUID()
      await db.insert(TABLE.notifications).values({
        id: notificationId,
        user_id: owner.id,
        kind: 'name-expiry',
        payload: {
          name: event.name,
          expiryDate: event.expiryDate * 1000,
          isOwner: true,
          watchReason: 'owned',
        },
        idempotency_key: buildIdempotencyKey(event, owner.id),
      })
      const result = await runQueue(
        'app-api-worker-event-ingestion',
        [event],
        bindings,
      )
      expect(result.explicitAcks).toEqual(['message-0'])
      const { notifications, deliveries } = await state()
      expect(notifications.map((row) => row.id)).toEqual([notificationId])
      expect(deliveries).toHaveLength(1)
      expect(deliveries[0]?.notification_id).toBe(notificationId)
      expect(email.sendBatch.mock.calls[0]?.[0][0]?.body.id).toBe(
        deliveries[0]?.id,
      )
      await assertNoDuplicateGroups()
    })

    it('replays idempotently and carries the same delivery ID through the email consumer', async () => {
      await seedRecipients(1)
      for (let attempt = 0; attempt < 2; attempt++) {
        const source = await runQueue(
          'app-api-worker-event-ingestion',
          [event],
          bindings,
        )
        expect(source.explicitAcks).toEqual(['message-0'])
      }
      const before = await state()
      expect(before.notifications).toHaveLength(1)
      expect(before.deliveries).toHaveLength(1)
      await assertNoDuplicateGroups()
      const jobs = email.sendBatch.mock.calls.flatMap(([batch]) =>
        batch.map((message) => message.body),
      )
      expect(jobs).toHaveLength(2)
      expect(jobs[0]).toEqual(jobs[1])
      expect(jobs[0]?.id).toBe(before.deliveries[0]?.id)
      for (const job of jobs) {
        const delivered = await runQueue(
          'app-api-worker-email-delivery',
          [job],
          bindings,
        )
        expect(delivered.explicitAcks).toEqual(['message-0'])
        expect(delivered.retryMessages).toEqual([])
      }
      expect(sendMail).toHaveBeenCalledOnce()
      const after = await state()
      expect(after.deliveries).toHaveLength(1)
      expect(after.deliveries[0]).toMatchObject({
        id: jobs[0]?.id,
        status: 'delivered',
      })
    })

    it('counts real JSONB push expirations when admitting the tenth and rejecting the eleventh endpoint', async () => {
      await seedRecipients(1)
      const owner = users[0]
      if (!owner) throw new Error('Missing fixture owner')
      const active = Array.from({ length: 9 }, (_, index) => ({
        user_id: owner.id,
        channel: 'push' as const,
        target: `https://fcm.googleapis.com/${crypto.randomUUID()}`,
        status: 'verified' as const,
        data: {
          auth: 'auth',
          p256dh: 'key',
          expirationTime: index % 2 ? Date.now() + 3600000 : null,
        },
      }))
      await db.insert(TABLE.userChannels).values([
        ...active,
        {
          ...active[0],
          user_id: owner.id,
          channel: 'push',
          status: 'verified',
          target: 'https://fcm.googleapis.com/expired',
          data: {
            auth: 'auth',
            p256dh: 'key',
            expirationTime: Date.now() - 3600000,
          },
        },
        {
          ...active[0],
          user_id: owner.id,
          channel: 'push',
          status: 'unsubscribed',
          target: 'https://fcm.googleapis.com/unsubscribed',
          data: { auth: 'auth', p256dh: 'key', expirationTime: null },
        },
      ])
      const token = await sign(
        {
          user_id: owner.id,
          address: owner.address,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        bindings.JWT_SECRET,
        'HS256',
      )
      const register = () =>
        pushApp.request(
          '/push',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: `https://fcm.googleapis.com/${crypto.randomUUID()}`,
              expirationTime: null,
              keys: { auth: 'auth', p256dh: 'key' },
            }),
          },
          bindings,
        )
      expect((await register()).status).toBe(201)
      expect((await register()).status).toBe(409)
    })
  },
)
