import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/backend-client', () => ({
  backendClient: {
    notifications: {
      channels: {
        push: {
          'vapid-public-key': {
            $get: vi.fn(),
          },
          $post: vi.fn(),
        },
        ':id': {
          $delete: vi.fn(),
        },
      },
    },
  },
}))

import { backendClient } from '@/utils/backend-client'
import {
  fetchVapidPublicKey,
  getExistingSubscription,
  getPermissionState,
  isPushSupported,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from './index'

const mockVapidGet = vi.mocked(
  backendClient.notifications.channels.push['vapid-public-key'].$get,
)
const mockPushPost = vi.mocked(
  backendClient.notifications.channels.push.$post,
)
const mockChannelDelete = vi.mocked(
  backendClient.notifications.channels[':id'].$delete,
)

function createMockSubscription(overrides?: {
  endpoint?: string
  auth?: string | null
  p256dh?: string | null
}) {
  const endpoint = overrides?.endpoint ?? 'https://push.example.com/sub/123'
  const auth = overrides && 'auth' in overrides ? overrides.auth : 'auth-key-base64'
  const p256dh = overrides && 'p256dh' in overrides ? overrides.p256dh : 'p256dh-key-base64'

  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { auth, p256dh },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription
}

/** Stubs browser APIs needed for push support */
function stubPushEnvironment(options?: {
  permission?: NotificationPermission
  requestPermission?: NotificationPermission
  subscription?: PushSubscription | null
  registerFn?: ReturnType<typeof vi.fn>
  subscribeFn?: ReturnType<typeof vi.fn>
}) {
  const permission = options?.permission ?? 'granted'
  const requestResult = options?.requestPermission ?? permission
  const subscription = options?.subscription ?? null

  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(requestResult),
  })

  const mockRegistration = {
    pushManager: {
      subscribe: options?.subscribeFn ?? vi.fn().mockResolvedValue(subscription),
      getSubscription: vi.fn().mockResolvedValue(subscription),
    },
  }

  const registerFn = options?.registerFn ?? vi.fn().mockResolvedValue(mockRegistration)

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: registerFn,
      ready: Promise.resolve(mockRegistration),
    },
    configurable: true,
  })

  return { mockRegistration, registerFn }
}

describe('push notification service', () => {
  const originalNavigator = { ...navigator }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
  })

  describe('isPushSupported', () => {
    it('should return true when all APIs are available', () => {
      stubPushEnvironment()
      expect(isPushSupported()).toBe(true)
    })

    it('should return false when serviceWorker is not available', () => {
      const nav = { ...navigator }
      // biome-ignore lint/performance/noDelete: need to remove the property for the test
      delete (nav as any).serviceWorker
      Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        writable: true,
        configurable: true,
      })

      expect(isPushSupported()).toBe(false)
    })

    it('should return false when PushManager is not available', () => {
      vi.stubGlobal('Notification', { permission: 'default' })
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve() },
        configurable: true,
      })
      // PushManager not stubbed

      expect(isPushSupported()).toBe(false)
    })
  })

  describe('getPermissionState', () => {
    it('should return the current Notification.permission', () => {
      vi.stubGlobal('Notification', { permission: 'granted' })
      expect(getPermissionState()).toBe('granted')
    })

    it('should return default when permission is default', () => {
      vi.stubGlobal('Notification', { permission: 'default' })
      expect(getPermissionState()).toBe('default')
    })

    it('should return denied when Notification is not available', () => {
      const origNotification = globalThis.Notification
      // biome-ignore lint/performance/noDelete: need to remove the property for the test
      delete (globalThis as any).Notification

      expect(getPermissionState()).toBe('denied')

      globalThis.Notification = origNotification
    })
  })

  describe('requestNotificationPermission', () => {
    it('should return granted when user accepts', async () => {
      stubPushEnvironment({ requestPermission: 'granted' })

      const result = await requestNotificationPermission()
      expect(result).toBe('granted')
    })

    it('should return denied when user rejects', async () => {
      stubPushEnvironment({ requestPermission: 'denied' })

      const result = await requestNotificationPermission()
      expect(result).toBe('denied')
    })

    it('should return denied when push is not supported', async () => {
      const nav = { ...navigator }
      // biome-ignore lint/performance/noDelete: need to remove the property for the test
      delete (nav as any).serviceWorker
      Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        writable: true,
        configurable: true,
      })

      const result = await requestNotificationPermission()
      expect(result).toBe('denied')
    })
  })

  describe('registerServiceWorker', () => {
    it('should register service worker and return registration', async () => {
      const { registerFn } = stubPushEnvironment()

      const result = await registerServiceWorker()

      expect(result).not.toBeNull()
      expect(registerFn).toHaveBeenCalledWith('/push-sw.js', { scope: '/' })
    })

    it('should return null when push is not supported', async () => {
      const nav = { ...navigator }
      // biome-ignore lint/performance/noDelete: need to remove the property for the test
      delete (nav as any).serviceWorker
      Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        writable: true,
        configurable: true,
      })

      const result = await registerServiceWorker()
      expect(result).toBeNull()
    })

    it('should return null when registration fails', async () => {
      stubPushEnvironment({
        registerFn: vi.fn().mockRejectedValue(new Error('SW registration failed')),
      })

      const result = await registerServiceWorker()
      expect(result).toBeNull()
    })
  })

  describe('getExistingSubscription', () => {
    it('should return existing subscription', async () => {
      const mockSubscription = createMockSubscription()
      stubPushEnvironment({ subscription: mockSubscription })

      const result = await getExistingSubscription()
      expect(result).toBe(mockSubscription)
    })

    it('should return null when no subscription exists', async () => {
      stubPushEnvironment({ subscription: null })

      const result = await getExistingSubscription()
      expect(result).toBeNull()
    })

    it('should return null when push is not supported', async () => {
      const nav = { ...navigator }
      // biome-ignore lint/performance/noDelete: need to remove the property for the test
      delete (nav as any).serviceWorker
      Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        writable: true,
        configurable: true,
      })

      const result = await getExistingSubscription()
      expect(result).toBeNull()
    })
  })

  describe('fetchVapidPublicKey', () => {
    it('should return the public key on success', async () => {
      mockVapidGet.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      } as any)

      const key = await fetchVapidPublicKey()
      expect(key).toBe('test-vapid-key')
    })

    it('should return null on non-ok response', async () => {
      mockVapidGet.mockResolvedValue({
        ok: false,
      } as any)

      const key = await fetchVapidPublicKey()
      expect(key).toBeNull()
    })

    it('should return null on network error', async () => {
      mockVapidGet.mockRejectedValue(new Error('Network error'))

      const key = await fetchVapidPublicKey()
      expect(key).toBeNull()
    })
  })

  describe('subscribeToPush', () => {
    it('should return error when push is not supported', async () => {
      const nav = { ...navigator }
      // biome-ignore lint/performance/noDelete: need to remove the property for the test
      delete (nav as any).serviceWorker
      Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        writable: true,
        configurable: true,
      })

      const result = await subscribeToPush()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Push notifications not supported')
    })

    it('should return error when permission is denied', async () => {
      stubPushEnvironment({ permission: 'default', requestPermission: 'denied' })

      const result = await subscribeToPush()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Notification permission denied')
    })

    it('should return error when VAPID key fetch fails', async () => {
      const mockSubscription = createMockSubscription()
      stubPushEnvironment({
        requestPermission: 'granted',
        subscribeFn: vi.fn().mockResolvedValue(mockSubscription),
      })

      mockVapidGet.mockResolvedValue({ ok: false } as any)

      const result = await subscribeToPush()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to get server public key')
    })

    it('should unsubscribe locally if subscription data is invalid', async () => {
      const badSubscription = createMockSubscription({ auth: null, p256dh: null })
      stubPushEnvironment({
        requestPermission: 'granted',
        subscribeFn: vi.fn().mockResolvedValue(badSubscription),
      })

      mockVapidGet.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      } as any)

      const result = await subscribeToPush()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid subscription data')
      expect(badSubscription.unsubscribe).toHaveBeenCalled()
    })

    it('should unsubscribe locally if server registration fails', async () => {
      const mockSubscription = createMockSubscription()
      stubPushEnvironment({
        requestPermission: 'granted',
        subscribeFn: vi.fn().mockResolvedValue(mockSubscription),
      })

      mockVapidGet.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      } as any)

      mockPushPost.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Registration failed' }),
      } as any)

      const result = await subscribeToPush()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Registration failed')
      expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    })

    it('should send correct payload to server on subscribe', async () => {
      const mockSubscription = createMockSubscription({
        endpoint: 'https://push.example.com/sub/abc',
        auth: 'my-auth-key',
        p256dh: 'my-p256dh-key',
      })
      stubPushEnvironment({
        requestPermission: 'granted',
        subscribeFn: vi.fn().mockResolvedValue(mockSubscription),
      })

      mockVapidGet.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      } as any)

      mockPushPost.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'channel-789' }),
      } as any)

      await subscribeToPush()

      expect(mockPushPost).toHaveBeenCalledWith({
        json: {
          endpoint: 'https://push.example.com/sub/abc',
          expirationTime: null,
          keys: {
            auth: 'my-auth-key',
            p256dh: 'my-p256dh-key',
          },
        },
      })
    })

    it('should return success with subscription and channelId', async () => {
      const mockSubscription = createMockSubscription()
      stubPushEnvironment({
        requestPermission: 'granted',
        subscribeFn: vi.fn().mockResolvedValue(mockSubscription),
      })

      mockVapidGet.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      } as any)

      mockPushPost.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'channel-456' }),
      } as any)

      const result = await subscribeToPush()

      expect(result.success).toBe(true)
      expect(result.subscription).toBe(mockSubscription)
      expect(result.channelId).toBe('channel-456')
    })

    it('should handle pushManager.subscribe throwing', async () => {
      stubPushEnvironment({
        requestPermission: 'granted',
        subscribeFn: vi.fn().mockRejectedValue(new Error('User dismissed prompt')),
      })

      mockVapidGet.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      } as any)

      const result = await subscribeToPush()

      expect(result.success).toBe(false)
      expect(result.error).toBe('User dismissed prompt')
    })
  })

  describe('unsubscribeFromPush', () => {
    it('should call server delete before local unsubscribe', async () => {
      const callOrder: string[] = []

      const mockSubscription = createMockSubscription()
      ;(mockSubscription.unsubscribe as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          callOrder.push('local-unsubscribe')
          return Promise.resolve(true)
        },
      )

      mockChannelDelete.mockImplementation(() => {
        callOrder.push('server-delete')
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as any)
      })

      stubPushEnvironment({ subscription: mockSubscription })

      const result = await unsubscribeFromPush('channel-123')

      expect(result.success).toBe(true)
      expect(callOrder).toEqual(['server-delete', 'local-unsubscribe'])
    })

    it('should not unsubscribe locally if server delete fails', async () => {
      const mockSubscription = createMockSubscription()

      mockChannelDelete.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      } as any)

      stubPushEnvironment({ subscription: mockSubscription })

      const result = await unsubscribeFromPush('channel-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Server error')
      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled()
    })

    it('should succeed even if no local subscription exists', async () => {
      mockChannelDelete.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)

      stubPushEnvironment({ subscription: null })

      const result = await unsubscribeFromPush('channel-123')
      expect(result.success).toBe(true)
    })

    it('should pass correct channelId to server', async () => {
      mockChannelDelete.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)

      stubPushEnvironment({ subscription: null })

      await unsubscribeFromPush('my-channel-id')

      expect(mockChannelDelete).toHaveBeenCalledWith({
        param: { id: 'my-channel-id' },
      })
    })

    it('should return error on network failure', async () => {
      mockChannelDelete.mockRejectedValue(new Error('Network down'))

      const result = await unsubscribeFromPush('channel-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network down')
    })
  })
})
