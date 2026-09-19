import { sign } from 'hono/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const findFirst = vi.fn()
  const count = vi.fn()
  const updateWhere = vi.fn()
  const insertReturning = vi.fn()
  const db = {
    query: {
      userChannels: {
        findFirst,
      },
    },
    $count: count,
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: insertReturning })),
    })),
  }

  return {
    findFirst,
    count,
    updateWhere,
    insertReturning,
    db,
    getDatabase: vi.fn(() => db),
  }
})

vi.mock('#core/database/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#core/database/index.js')>()
  return {
    ...actual,
    getDatabase: mocks.getDatabase,
  }
})

import pushApp, { MAX_ACTIVE_PUSH_SUBSCRIPTIONS } from './push.js'

const JWT_SECRET = 'test-jwt-secret'
const env = { JWT_SECRET } as CloudflareBindings
const requestBody: {
  readonly endpoint: string
  readonly expirationTime: number | null
  readonly keys: { readonly auth: string; readonly p256dh: string }
} = {
  endpoint: 'https://fcm.googleapis.com/push/subscription-1',
  expirationTime: null,
  keys: {
    auth: 'rotating-auth-key',
    p256dh: 'rotating-p256dh-key',
  },
}

const authHeader = async () => {
  const token = await sign(
    {
      user_id: 'user-1',
      address: '0xabc',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET,
    'HS256',
  )
  return { Authorization: `Bearer ${token}` }
}

const postSubscription = async (
  body: typeof requestBody = requestBody,
): Promise<Response> =>
  pushApp.request(
    '/push',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeader()),
      },
      body: JSON.stringify(body),
    },
    env,
  )

describe('POST /push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue(undefined)
    mocks.count.mockResolvedValue(0)
    mocks.insertReturning.mockResolvedValue([{ id: 'channel-new' }])
    mocks.updateWhere.mockResolvedValue(undefined)
  })

  it('creates a new endpoint below the active subscription cap', async () => {
    mocks.count.mockResolvedValue(MAX_ACTIVE_PUSH_SUBSCRIPTIONS - 1)

    const response = await postSubscription()

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 'channel-new' })
    expect(mocks.db.insert).toHaveBeenCalledOnce()
  })

  it('rejects an eleventh active endpoint', async () => {
    mocks.count.mockResolvedValue(MAX_ACTIVE_PUSH_SUBSCRIPTIONS)

    const response = await postSubscription()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Maximum active push subscriptions reached',
    })
    expect(mocks.db.insert).not.toHaveBeenCalled()
  })

  it('updates an existing endpoint even when the user is at the cap', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'channel-existing' })
    mocks.count.mockResolvedValue(MAX_ACTIVE_PUSH_SUBSCRIPTIONS)

    const response = await postSubscription()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'channel-existing',
      updated: true,
    })
    expect(mocks.updateWhere).toHaveBeenCalledOnce()
    expect(mocks.count).not.toHaveBeenCalled()
    expect(mocks.db.insert).not.toHaveBeenCalled()
  })

  it('allows creation when inactive and expired endpoints are excluded from the active count', async () => {
    mocks.count.mockResolvedValue(MAX_ACTIVE_PUSH_SUBSCRIPTIONS - 1)

    const response = await postSubscription({
      ...requestBody,
      endpoint: 'https://fcm.googleapis.com/push/subscription-after-expiry',
      expirationTime: Date.now() + 60_000,
    })

    expect(response.status).toBe(201)
    expect(mocks.count).toHaveBeenCalledOnce()
    expect(mocks.db.insert).toHaveBeenCalledOnce()
  })

  it('treats null expiration time as active', async () => {
    mocks.count.mockResolvedValue(MAX_ACTIVE_PUSH_SUBSCRIPTIONS)

    const response = await postSubscription({
      ...requestBody,
      endpoint: 'https://fcm.googleapis.com/push/subscription-null-expiry',
      expirationTime: null,
    })

    expect(response.status).toBe(409)
    expect(mocks.db.insert).not.toHaveBeenCalled()
  })
})
