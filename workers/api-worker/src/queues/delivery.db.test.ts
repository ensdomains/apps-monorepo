import { env } from 'cloudflare:workers'
import type { ChannelType } from '@ens-apps/shared-schema/notifications'
import { eq, inArray } from 'drizzle-orm'
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
import channelApp from '#app/routes/notifications/channels/$id.js'
import { type Database, getDatabase, TABLE } from '#core/database/index.js'
import { resolveDeliveryChannel } from '#services/delivery/channel.js'
import { createNotification } from '#services/notifications/create.js'
import { makeMockEnv, makeMockQueue } from '#test-utils/env.js'
import { runQueue } from '#test-utils/queue.js'
import { requireLocalTestDatabase } from '#test-utils/real-db-config.js'
import type { BaseDeliveryJob } from '#types/delivery.js'

// Providers are the only external side effects permitted, even in this suite.
const providers = vi.hoisted(() => ({
  email: vi.fn(),
  telegram: vi.fn(),
  encrypt: vi.fn(),
  push: vi.fn(),
}))
vi.mock('#services/email/utils.js', () => ({ sendMailV3: providers.email }))
vi.mock('#services/telegram/utils.js', () => ({
  makeTelegramRequest: providers.telegram,
  createInlineKeyboard: vi.fn(),
}))
vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: providers.encrypt,
}))

const testEnv = env as CloudflareBindings & {
  RUN_REAL_DB_TESTS: string
  REAL_DB_DATABASE_URL: string
}

const PUSH_ORIGIN = 'https://fcm.googleapis.com/'

const queueName = (channel: ChannelType) => `app-api-worker-${channel}-delivery`

describe.skipIf(testEnv.RUN_REAL_DB_TESTS !== '1')(
  'real local delivery source-channel identity',
  () => {
    let db: Database
    let bindings: CloudflareBindings
    let userIds: string[] = []
    let queues: Record<ChannelType, ReturnType<typeof makeMockQueue>>

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
        SENDGRID_BROADCAST_LIST_ID: '',
        TELEGRAM_BOT_TOKEN: 'never-sent',
      })
      db = getDatabase(bindings)
    })

    beforeEach(() => {
      userIds = []
      queues = {
        email: makeMockQueue(),
        push: makeMockQueue(),
        telegram: makeMockQueue(),
      }
      bindings = {
        ...bindings,
        EMAIL_QUEUE: queues.email as Queue,
        PUSH_QUEUE: queues.push as Queue,
        TELEGRAM_QUEUE: queues.telegram as Queue,
      }
      providers.email.mockReset().mockReturnValue(ok({ statusCode: 202 }))
      providers.telegram.mockReset().mockReturnValue(ok({ message_id: 1 }))
      providers.encrypt.mockReset().mockResolvedValue({ method: 'POST' })
      providers.push
        .mockReset()
        .mockResolvedValue(new Response(null, { status: 201 }))
      // The Neon HTTP driver also uses fetch; only push endpoints are faked.
      const realFetch = globalThis.fetch
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(PUSH_ORIGIN)
          ? providers.push(input, init)
          : realFetch(input, init),
      )
    })

    afterEach(async () => {
      vi.unstubAllGlobals()
      // Delete only this test's users, cascading their fixtures.
      requireLocalTestDatabase(testEnv.RUN_REAL_DB_TESTS, bindings.DATABASE_URL)
      if (userIds.length)
        await db.delete(TABLE.users).where(inArray(TABLE.users.id, userIds))
    })

    const seedUser = async () => {
      const user = {
        id: crypto.randomUUID(),
        address: `0x${crypto.randomUUID().replaceAll('-', '')}`,
      }
      userIds.push(user.id)
      await db.insert(TABLE.users).values(user)
      await db.insert(TABLE.userNotificationSettings).values({
        user_id: user.id,
        owned_name_expiry: true,
      })
      return user
    }

    const addChannel = async (
      userId: string,
      channel: ChannelType,
      target: string,
      data: typeof TABLE.userChannels.$inferInsert.data = null,
    ) => {
      const [row] = await db
        .insert(TABLE.userChannels)
        .values({
          user_id: userId,
          channel,
          target,
          data,
          status: 'verified',
          verified_at: new Date(),
        })
        .returning()
      if (!row) throw new Error('Missing channel fixture')
      return row
    }

    /** Ordinary notification creation; returns the jobs it enqueued. */
    const notify = async (userId: string) => {
      const result = await createNotification({
        env: bindings,
        db,
        userId,
        kind: 'name-expiry',
        payload: {
          name: 'alpha.eth',
          expiryDate: 1700000000000,
          stage: 'grace-7d',
          isOwner: true,
          watchReason: 'owned',
        },
        idempotencyKey: crypto.randomUUID(),
      })
      if (result.isErr()) throw result.error
      return Object.values(queues).flatMap((queue) =>
        queue.send.mock.calls
          .map(([job]) => job as BaseDeliveryJob)
          .filter((job) => job.notificationId === result.value.id),
      )
    }

    const delivery = (id: string) =>
      db.query.notificationDeliveries.findFirst({
        where: eq(TABLE.notificationDeliveries.id, id),
      })

    const channelRow = (id: string) =>
      db.query.userChannels.findFirst({
        where: eq(TABLE.userChannels.id, id),
      })

    const deleteChannel = async (
      user: { id: string; address: string },
      channelId: string,
    ) => {
      const token = await sign(
        {
          user_id: user.id,
          address: user.address,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        bindings.JWT_SECRET,
        'HS256',
      )
      const response = await channelApp.request(
        `/${channelId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        bindings,
      )
      expect(response.status).toBe(200)
    }

    it('creates each delivery bound to its exact source channel and sends to its target', async () => {
      const user = await seedUser()
      const channel = await addChannel(
        user.id,
        'email',
        `${user.id}@example.com`,
      )
      const [job, ...rest] = await notify(user.id)
      if (!job) throw new Error('Missing delivery job')
      expect(rest).toEqual([])
      expect(await delivery(job.id)).toMatchObject({
        channel_id: channel.id,
        channel: 'email',
        status: 'queued',
      })

      const result = await runQueue(queueName('email'), [job], bindings)
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(providers.email).toHaveBeenCalledWith(
        'never-sent',
        expect.objectContaining({
          personalizations: [{ to: [{ email: channel.target }] }],
        }),
      )
      expect((await delivery(job.id))?.status).toBe('delivered')
    })

    it('keeps deliveries as unbound history when their channels are deleted, and cancels the queued sends', async () => {
      const user = await seedUser()
      const first = await addChannel(user.id, 'email', `a-${user.id}@x.com`)
      const second = await addChannel(user.id, 'email', `b-${user.id}@x.com`)
      const jobs = await notify(user.id)
      expect(jobs).toHaveLength(2)

      // Both deliveries of one notification become (notification, NULL):
      // unbound history must not conflict under the uniqueness constraint.
      await deleteChannel(user, first.id)
      await deleteChannel(user, second.id)
      for (const job of jobs)
        expect(await delivery(job.id)).toMatchObject({
          channel_id: null,
          channel: 'email',
          status: 'queued',
        })

      const result = await runQueue(queueName('email'), jobs, bindings)
      expect(result.explicitAcks).toEqual(['message-0', 'message-1'])
      expect(result.retryMessages).toEqual([])
      expect(providers.email).not.toHaveBeenCalled()
      for (const job of jobs)
        expect(await delivery(job.id)).toMatchObject({
          status: 'cancelled',
          error: 'SOURCE_CHANNEL_REMOVED',
        })
    })

    it('does not cancel a delivery that another copy of the job completed meanwhile', async () => {
      const user = await seedUser()
      const source = await addChannel(user.id, 'email', `${user.id}@x.com`)
      const [job] = await notify(user.id)
      if (!job) throw new Error('Missing delivery job')
      await deleteChannel(user, source.id)

      // This copy loads the delivery still queued; the other copy, which
      // passed the channel check before the removal, then records its send.
      const racingDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== 'query')
            return Reflect.get(target, property, receiver)
          return {
            ...target.query,
            notificationDeliveries: {
              ...target.query.notificationDeliveries,
              findFirst: async (
                ...args: Parameters<
                  Database['query']['notificationDeliveries']['findFirst']
                >
              ) => {
                const loaded =
                  await target.query.notificationDeliveries.findFirst(...args)
                await target
                  .update(TABLE.notificationDeliveries)
                  .set({ status: 'delivered' })
                  .where(eq(TABLE.notificationDeliveries.id, job.id))
                return loaded
              },
            },
          }
        },
      })

      const resolved = await resolveDeliveryChannel(racingDb, job, 'email')
      expect(resolved._unsafeUnwrap()).toBeNull()
      expect(await delivery(job.id)).toMatchObject({
        status: 'delivered',
        error: null,
      })
    })

    it('skips a channel removed between reading it and creating its delivery', async () => {
      const user = await seedUser()
      const kept = await addChannel(user.id, 'email', `a-${user.id}@x.com`)
      const removed = await addChannel(user.id, 'email', `b-${user.id}@x.com`)

      // The account unlinks a channel right after creation has read it.
      const racingDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== 'query')
            return Reflect.get(target, property, receiver)
          return {
            ...target.query,
            userChannels: {
              ...target.query.userChannels,
              findMany: async (
                ...args: Parameters<
                  Database['query']['userChannels']['findMany']
                >
              ) => {
                const channels = await target.query.userChannels.findMany(
                  ...args,
                )
                await target
                  .delete(TABLE.userChannels)
                  .where(eq(TABLE.userChannels.id, removed.id))
                return channels
              },
            },
          }
        },
      })

      const result = await createNotification({
        env: bindings,
        db: racingDb,
        userId: user.id,
        kind: 'name-expiry',
        payload: {
          name: 'alpha.eth',
          expiryDate: 1700000000000,
          stage: 'grace-7d',
          isOwner: true,
          watchReason: 'owned',
        },
        idempotencyKey: crypto.randomUUID(),
      })
      const notification = result._unsafeUnwrap()
      const deliveries = await db.query.notificationDeliveries.findMany({
        where: eq(
          TABLE.notificationDeliveries.notification_id,
          notification.id,
        ),
      })
      expect(deliveries.map((row) => row.channel_id)).toEqual([kept.id])
      expect(queues.email.send).toHaveBeenCalledOnce()
    })

    it('never moves a queued delivery onto a re-created channel with the same target', async () => {
      const user = await seedUser()
      const target = `${user.id}@example.com`
      const original = await addChannel(user.id, 'email', target)
      const [job] = await notify(user.id)
      if (!job) throw new Error('Missing delivery job')

      await deleteChannel(user, original.id)
      const recreated = await addChannel(user.id, 'email', target)

      const result = await runQueue(queueName('email'), [job], bindings)
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(providers.email).not.toHaveBeenCalled()
      expect(await delivery(job.id)).toMatchObject({
        channel_id: null,
        status: 'cancelled',
      })
      expect(await channelRow(recreated.id)).toMatchObject({
        status: 'verified',
        last_bounce_at: null,
      })
    })

    it.each([
      ['email', 'bounced', 'SOURCE_CHANNEL_BOUNCED'],
      ['telegram', 'disabled', 'SOURCE_CHANNEL_DISABLED'],
    ] as const)('does not contact the provider when the %s source channel became %s while queued', async (channel, status, reason) => {
      const user = await seedUser()
      const source = await addChannel(user.id, channel, `${user.id}-target`)
      const [job] = await notify(user.id)
      if (!job) throw new Error('Missing delivery job')
      await db
        .update(TABLE.userChannels)
        .set({ status })
        .where(eq(TABLE.userChannels.id, source.id))

      const result = await runQueue(queueName(channel), [job], bindings)
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(providers[channel]).not.toHaveBeenCalled()
      expect(await delivery(job.id)).toMatchObject({
        channel_id: source.id,
        status: 'cancelled',
        error: reason,
      })
    })

    it('encrypts for, and on 410 unsubscribes, only the source push subscription of a shared endpoint', async () => {
      const endpoint = `${PUSH_ORIGIN}${crypto.randomUUID()}`
      const bystander = await seedUser()
      const recipient = await seedUser()
      const other = await addChannel(bystander.id, 'push', endpoint, {
        auth: 'bystander-auth',
        p256dh: 'bystander-key',
        expirationTime: null,
      })
      const source = await addChannel(recipient.id, 'push', endpoint, {
        auth: 'recipient-auth',
        p256dh: 'recipient-key',
        expirationTime: null,
      })
      const [job] = await notify(recipient.id)
      if (!job) throw new Error('Missing delivery job')
      providers.push.mockResolvedValue(new Response('gone', { status: 410 }))

      const result = await runQueue(queueName('push'), [job], bindings)
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(result.retryMessages).toEqual([])
      expect(providers.encrypt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint,
          keys: { auth: 'recipient-auth', p256dh: 'recipient-key' },
        }),
        expect.anything(),
      )
      expect(await delivery(job.id)).toMatchObject({
        channel_id: source.id,
        status: 'permanently_failed',
        failure_category: 'hard_bounce',
      })
      expect((await channelRow(source.id))?.status).toBe('unsubscribed')
      expect((await channelRow(other.id))?.status).toBe('verified')
    })

    it('DLQ hard bounce marks only the source channel of a shared mailbox', async () => {
      const shared = `${crypto.randomUUID()}@example.com`
      const bystander = await seedUser()
      const recipient = await seedUser()
      const other = await addChannel(bystander.id, 'email', shared)
      const source = await addChannel(recipient.id, 'email', shared)
      const [job] = await notify(recipient.id)
      if (!job) throw new Error('Missing delivery job')
      await db
        .update(TABLE.notificationDeliveries)
        .set({ status: 'failed', error: 'The email address does not exist' })
        .where(eq(TABLE.notificationDeliveries.id, job.id))

      const result = await runQueue('app-api-worker-dlq', [job], bindings)
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(await delivery(job.id)).toMatchObject({
        status: 'permanently_failed',
        failure_category: 'hard_bounce',
      })
      expect((await channelRow(source.id))?.status).toBe('bounced')
      expect((await channelRow(other.id))?.status).toBe('verified')
    })

    it('DLQ hard bounce of a removed channel mutates no channel sharing its target', async () => {
      const shared = `${crypto.randomUUID()}@example.com`
      const user = await seedUser()
      const bystander = await seedUser()
      const source = await addChannel(user.id, 'email', shared)
      const other = await addChannel(bystander.id, 'email', shared)
      const [job] = await notify(user.id)
      if (!job) throw new Error('Missing delivery job')
      await db
        .update(TABLE.notificationDeliveries)
        .set({ status: 'failed', error: 'The email address does not exist' })
        .where(eq(TABLE.notificationDeliveries.id, job.id))
      await deleteChannel(user, source.id)
      const recreated = await addChannel(user.id, 'email', shared)

      const result = await runQueue('app-api-worker-dlq', [job], bindings)
      expect(result.explicitAcks).toEqual(['message-0'])
      expect(await delivery(job.id)).toMatchObject({
        channel_id: null,
        status: 'permanently_failed',
      })
      expect((await channelRow(other.id))?.status).toBe('verified')
      expect((await channelRow(recreated.id))?.status).toBe('verified')
    })
  },
)
