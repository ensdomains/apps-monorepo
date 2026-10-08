import { env } from 'cloudflare:workers'
import { err, ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabase } from '#core/database/index.js'
import { makeMockEnv, makeMockQueue } from '#test-utils/env.js'
import { runQueue } from '#test-utils/queue.js'

const providers = vi.hoisted(() => ({
  email: vi.fn(),
  telegram: vi.fn(),
  push: vi.fn(),
  encrypt: vi.fn(),
}))
vi.mock('#services/email/utils.js', () => ({ sendMailV3: providers.email }))
vi.mock('#services/telegram/utils.js', () => ({
  makeTelegramRequest: providers.telegram,
  createInlineKeyboard: vi.fn(),
}))
vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: providers.encrypt,
}))
vi.mock('#core/database/index.js', async (original) => ({
  ...(await original<typeof import('#core/database/index.js')>()),
  getDatabase: vi.fn(),
}))

const job = {
  id: 'persisted-delivery',
  notificationId: 'notification',
  userId: 'owner',
  kind: 'name-expiry',
}
const targets = {
  email: 'owner@example.com',
  push: 'https://fcm.googleapis.com/subscription',
  telegram: '12345',
}
const settings = () =>
  makeMockEnv({
    ...env,
    SENDGRID_API_KEY: 'test',
    TELEGRAM_BOT_TOKEN: 'test',
    VAPID_PRIVATE_KEY: 'test',
  })
const deliveryDb = (
  channel: keyof typeof targets,
  status = 'queued',
  error: string | null = null,
) => {
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }))
  const db = {
    query: {
      notificationDeliveries: {
        findFirst: vi.fn().mockResolvedValue({
          id: job.id,
          channel,
          channel_id: `${channel}-channel`,
          status,
          error,
          dlq_attempts: 1,
          notification: {
            payload: {
              name: 'alpha.eth',
              expiryDate: 1700000000000,
              isOwner: true,
              watchReason: 'owned',
            },
          },
          sourceChannel: {
            id: `${channel}-channel`,
            channel,
            target: targets[channel],
            status: 'verified',
            data:
              channel === 'push'
                ? { auth: 'auth', p256dh: 'key', expirationTime: null }
                : null,
          },
        }),
      },
    },
    update: vi.fn(() => ({ set })),
  }
  vi.mocked(getDatabase).mockReturnValue(db as never)
  return { db, set }
}

beforeEach(() => {
  vi.clearAllMocks()
  providers.email.mockReturnValue(ok({ statusCode: 202 }))
  providers.telegram.mockReturnValue(ok({ message_id: 123 }))
  providers.encrypt.mockResolvedValue({ method: 'POST' })
  providers.push.mockResolvedValue(new Response(null, { status: 201 }))
  vi.stubGlobal('fetch', providers.push)
})
afterEach(() => vi.unstubAllGlobals())

describe.each([
  'email',
  'push',
  'telegram',
] as const)('%s queue contract', (channel) => {
  it("sends to the source channel's target, records delivery, and ACKs", async () => {
    const { set } = deliveryDb(channel)
    const result = await runQueue(
      `app-api-worker-${channel}-delivery`,
      [job],
      settings(),
    )
    expect(result.explicitAcks).toEqual(['message-0'])
    expect(result.retryMessages).toEqual([])
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'delivered',
        provider_msg_id: expect.any(String),
      }),
    )
    expect(providers[channel]).toHaveBeenCalledOnce()
    if (channel === 'email') {
      expect(providers.email).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          subject: 'Domain grace period ended',
          personalizations: [{ to: [{ email: targets.email }] }],
          content: [
            {
              type: 'text/plain',
              value: expect.stringContaining('alpha.eth'),
            },
            {
              type: 'text/html',
              value: expect.stringContaining('alpha.eth'),
            },
          ],
        }),
      )
      expect(providers.email.mock.calls[0]?.[1]).not.toHaveProperty(
        'template_id',
      )
    }
    if (channel === 'push')
      expect(providers.push).toHaveBeenCalledWith(targets.push, {
        method: 'POST',
      })
    if (channel === 'telegram')
      expect(providers.telegram).toHaveBeenCalledWith(
        'test',
        'sendMessage',
        expect.objectContaining({
          chat_id: targets.telegram,
          text: expect.stringContaining('alpha.eth'),
        }),
      )
  })

  it('records a provider failure and retries the message', async () => {
    const { set } = deliveryDb(channel)
    if (channel === 'push')
      providers.push.mockResolvedValue(
        new Response('unavailable', { status: 503 }),
      )
    else
      providers[channel].mockReturnValue(err(new Error('provider unavailable')))
    const result = await runQueue(
      `app-api-worker-${channel}-delivery`,
      [job],
      settings(),
    )
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('unavailable'),
        attempts: 2,
      }),
    )
    expect(result.explicitAcks).toEqual([])
    expect(result.retryMessages).toEqual([{ msgId: 'message-0' }])
  })
})

it('ACKs an already-delivered email job without contacting the provider', async () => {
  const { set } = deliveryDb('email', 'delivered')
  const result = await runQueue(
    'app-api-worker-email-delivery',
    [job],
    settings(),
  )
  expect(result.explicitAcks).toEqual(['message-0'])
  expect(result.retryMessages).toEqual([])
  expect(providers.email).not.toHaveBeenCalled()
  expect(set).not.toHaveBeenCalled()
})

it('DLQ requeues a rate-limited email with delay, increments its budget, and ACKs', async () => {
  const { set } = deliveryDb('email', 'failed', 'status 429')
  const email = makeMockQueue()
  const result = await runQueue(
    'app-api-worker-dlq',
    [job],
    makeMockEnv({ EMAIL_QUEUE: email }),
  )
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'queued',
      dlq_attempts: 2,
      failure_category: 'rate_limit',
    }),
  )
  expect(email.send).toHaveBeenCalledWith(job, { delaySeconds: 300 })
  expect(result.explicitAcks).toEqual(['message-0'])
  expect(result.retryMessages).toEqual([])
})

it('DLQ records an unknown failure as permanent and ACKs without requeue', async () => {
  const { set } = deliveryDb(
    'email',
    'failed',
    'unclassified provider response',
  )
  const email = makeMockQueue()
  const result = await runQueue(
    'app-api-worker-dlq',
    [job],
    makeMockEnv({ EMAIL_QUEUE: email }),
  )
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'permanently_failed',
      failure_category: 'unknown',
    }),
  )
  expect(email.send).not.toHaveBeenCalled()
  expect(result.explicitAcks).toEqual(['message-0'])
  expect(result.retryMessages).toEqual([])
})
