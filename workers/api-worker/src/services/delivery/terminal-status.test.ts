import { ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeliveryStatus } from '#core/database/schema/notifications.js'
import type { BaseDeliveryJob } from '#types/delivery.js'

const mocks = vi.hoisted(() => ({
  buildPushPayload: vi.fn(),
  createInlineKeyboard: vi.fn(),
  fetch: vi.fn(),
  makeTelegramRequest: vi.fn(),
  sendMailV3: vi.fn(),
}))

vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: mocks.buildPushPayload,
}))

vi.mock('#services/email/utils.js', () => ({
  sendMailV3: mocks.sendMailV3,
}))

vi.mock('#services/telegram/utils.js', () => ({
  createInlineKeyboard: mocks.createInlineKeyboard,
  makeTelegramRequest: mocks.makeTelegramRequest,
}))

vi.mock('./templates/email.js', () => ({
  emailTemplates: {
    'name-expiry': async () => ({
      subject: 'Expiry reminder',
      html: '<p>alpha.eth</p>',
      text: 'alpha.eth',
    }),
  },
}))

vi.mock('./templates/push.js', () => ({
  pushTemplates: {
    'name-expiry': () => ({ title: 'Expiry reminder', body: 'alpha.eth' }),
  },
}))

vi.mock('./templates/telegram.js', () => ({
  telegramTemplates: {
    'name-expiry': () => ({ text: 'Expiry reminder' }),
  },
}))

import { deliverEmailNotification } from './email.js'
import { deliverPushNotification } from './push.js'
import { deliverTelegramNotification } from './telegram.js'

const job: BaseDeliveryJob = {
  id: 'delivery-1',
  notificationId: 'notification-1',
  userId: 'user-1',
  kind: 'name-expiry',
}

const makeDb = (
  status: DeliveryStatus,
  channel: 'email' | 'push' | 'telegram',
) => {
  const updateWhere = vi.fn(async () => undefined)
  const db = {
    query: {
      notificationDeliveries: {
        findFirst: vi.fn(async () => ({
          channel,
          status,
          notification: {
            payload: {
              name: 'alpha.eth',
              expiryDate: Date.now() + 86_400_000,
              isOwner: true,
              watchReason: 'owned',
            },
          },
          sourceChannel: {
            id: 'channel-1',
            channel,
            target: 'https://fcm.googleapis.com/push/subscription-1',
            status: 'verified',
            data: {
              auth: 'auth',
              p256dh: 'p256dh',
              expirationTime: null,
            },
          },
        })),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
  }

  return { db, updateWhere }
}

const pushEnv = {
  VAPID_SUBJECT: 'mailto:test@example.com',
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildPushPayload.mockResolvedValue({})
  mocks.fetch.mockResolvedValue(
    new Response(null, {
      status: 201,
      headers: { location: 'provider-message-id' },
    }),
  )
  mocks.makeTelegramRequest.mockReturnValue(ok({ message_id: 123 }))
  mocks.sendMailV3.mockReturnValue(ok({ statusCode: 202 }))
  vi.stubGlobal('fetch', mocks.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([
  'delivered',
  'permanently_failed',
  'cancelled',
] as const)('terminal delivery status %s', (status) => {
  it('skips the email provider', async () => {
    const { db, updateWhere } = makeDb(status, 'email')

    const result = await deliverEmailNotification(
      'api-key',
      'from@example.com',
      db as never,
      job,
    )

    expect(result.isOk()).toBe(true)
    expect(mocks.sendMailV3).not.toHaveBeenCalled()
    expect(updateWhere).not.toHaveBeenCalled()
  })

  it('skips the push provider', async () => {
    const { db, updateWhere } = makeDb(status, 'push')

    const result = await deliverPushNotification(pushEnv, db as never, job)

    expect(result.isOk()).toBe(true)
    expect(mocks.buildPushPayload).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(updateWhere).not.toHaveBeenCalled()
  })

  it('skips the Telegram provider', async () => {
    const { db, updateWhere } = makeDb(status, 'telegram')

    const result = await deliverTelegramNotification(
      'bot-token',
      db as never,
      job,
    )

    expect(result.isOk()).toBe(true)
    expect(mocks.makeTelegramRequest).not.toHaveBeenCalled()
    expect(updateWhere).not.toHaveBeenCalled()
  })
})

describe.each([
  'queued',
  'failed',
] as const)('nonterminal delivery status %s', (status) => {
  it('still sends through every provider', async () => {
    const email = makeDb(status, 'email')
    const push = makeDb(status, 'push')
    const telegram = makeDb(status, 'telegram')

    const [emailResult, pushResult, telegramResult] = await Promise.all([
      deliverEmailNotification(
        'api-key',
        'from@example.com',
        email.db as never,
        job,
      ),
      deliverPushNotification(pushEnv, push.db as never, job),
      deliverTelegramNotification('bot-token', telegram.db as never, job),
    ])

    expect(emailResult.isOk()).toBe(true)
    expect(pushResult.isOk()).toBe(true)
    expect(telegramResult.isOk()).toBe(true)
    expect(mocks.sendMailV3).toHaveBeenCalledOnce()
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(mocks.makeTelegramRequest).toHaveBeenCalledOnce()
  })
})
