import {
  type MutationFunctionContext,
  QueryClient,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/backend-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/backend-client')>()),
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

import { backendAuthStore, backendClient } from '@/utils/backend-client'
import {
  browserPushStateQueryOptions,
  disableBrowserPushMutationOptions,
  enableBrowserPushMutationOptions,
} from './push'

const mockVapidGet = vi.mocked(
  backendClient.notifications.channels.push['vapid-public-key'].$get,
)
const mockPushPost = vi.mocked(backendClient.notifications.channels.push.$post)
const mockDelete = vi.mocked(
  backendClient.notifications.channels[':id'].$delete,
)

const mutationContext = {} as MutationFunctionContext

const pushGetResponse = (ok: boolean) =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ publicKey: 'vapid-public-key' }),
  }) as never

const pushPostResponse = (ok: boolean) =>
  ({
    ok,
    status: ok ? 201 : 500,
    json: async () => (ok ? { id: 'channel-123' } : { error: 'failed' }),
  }) as never

const pushDeleteResponse = (ok: boolean) =>
  ({
    ok,
    status: ok ? 200 : 404,
    json: async () =>
      ok ? { message: 'Channel deleted successfully' } : { error: 'not found' },
  }) as never

function createMockSubscription(endpoint = 'https://push.example.com/sub/123') {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: {
        auth: 'auth-key-base64',
        p256dh: 'p256dh-key-base64',
      },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription
}

function stubPushEnvironment(options?: {
  permission?: NotificationPermission
  requestPermission?: NotificationPermission
  subscription?: PushSubscription | null
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

  const subscribeFn =
    options?.subscribeFn ?? vi.fn().mockResolvedValue(subscription)

  const registration = {
    pushManager: {
      subscribe: subscribeFn,
      getSubscription: vi.fn().mockResolvedValue(subscription),
    },
  }

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
    configurable: true,
  })
}

describe('push query orchestration', () => {
  const originalNavigator = { ...navigator }

  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signIn({ authKey: 'session-a', address: '0xabc' })
  })

  afterEach(() => {
    backendAuthStore.trigger.signOut()
    vi.unstubAllGlobals()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
  })

  it('browser state returns unsupported when push is not supported', async () => {
    const nav = { ...navigator }
    delete (nav as { serviceWorker?: unknown }).serviceWorker
    Object.defineProperty(globalThis, 'navigator', {
      value: nav,
      writable: true,
      configurable: true,
    })

    const queryClient = new QueryClient()
    const result = await queryClient.fetchQuery(browserPushStateQueryOptions)
    expect(result).toEqual({
      isSupported: false,
      permission: 'denied',
      endpointHash: null,
    })
  })

  it('browser state returns endpoint hash for active subscription', async () => {
    stubPushEnvironment({
      permission: 'granted',
      subscription: createMockSubscription(),
    })

    const queryClient = new QueryClient()
    const result = await queryClient.fetchQuery(browserPushStateQueryOptions)
    expect(result).toEqual({
      isSupported: true,
      permission: 'granted',
      endpointHash:
        'c1858014ce0f52b202f1c8e38d6f0220c7de57d0ee157b8da1d9c08ca4a253a6',
    })
  })

  it('enable mutation subscribes and posts push payload', async () => {
    stubPushEnvironment({
      requestPermission: 'granted',
      subscription: createMockSubscription(),
    })
    mockVapidGet.mockResolvedValue(pushGetResponse(true))
    mockPushPost.mockResolvedValue(pushPostResponse(true))

    const mutationFn = enableBrowserPushMutationOptions.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')
    const result = await mutationFn(undefined, mutationContext)

    expect(result).toEqual({
      permission: 'granted',
      channel: { id: 'channel-123' },
    })
    expect(mockPushPost).toHaveBeenCalledWith({
      json: {
        endpoint: 'https://push.example.com/sub/123',
        expirationTime: null,
        keys: {
          auth: 'auth-key-base64',
          p256dh: 'p256dh-key-base64',
        },
      },
    })
  })

  it('enable mutation throws on denied permission', async () => {
    stubPushEnvironment({ requestPermission: 'denied' })

    const mutationFn = enableBrowserPushMutationOptions.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')

    await expect(mutationFn(undefined, mutationContext)).rejects.toMatchObject({
      _tag: 'PushPermissionDeniedError',
    })
  })

  it('disable mutation returns removed false when no local subscription exists', async () => {
    stubPushEnvironment({ subscription: null })

    const queryClient = {
      ensureQueryData: vi.fn().mockResolvedValue([]),
    } as unknown as QueryClient

    const mutation = disableBrowserPushMutationOptions(queryClient)
    const mutationFn = mutation.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')
    const result = await mutationFn(undefined, mutationContext)

    expect(result).toEqual({ removed: false })
  })

  it('disable mutation deletes matched channel and unsubscribes locally', async () => {
    const subscription = createMockSubscription()
    stubPushEnvironment({ subscription })
    mockDelete.mockResolvedValue(pushDeleteResponse(true))

    const queryClient = {
      ensureQueryData: vi.fn().mockResolvedValue([
        {
          id: 'channel-123',
          channel: 'push',
          endpointHash:
            'c1858014ce0f52b202f1c8e38d6f0220c7de57d0ee157b8da1d9c08ca4a253a6',
        },
      ]),
    } as unknown as QueryClient

    const mutation = disableBrowserPushMutationOptions(queryClient)
    const mutationFn = mutation.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')
    const result = await mutationFn(undefined, mutationContext)

    expect(result).toEqual({ removed: true })
    expect(mockDelete).toHaveBeenCalledWith({
      param: { id: 'channel-123' },
    })
  })

  it('disable mutation throws when no channel matches endpoint hash', async () => {
    stubPushEnvironment({
      subscription: createMockSubscription(),
    })

    const queryClient = {
      ensureQueryData: vi.fn().mockResolvedValue([
        {
          id: 'channel-123',
          channel: 'push',
          endpointHash: 'different-hash',
        },
      ]),
    } as unknown as QueryClient

    const mutation = disableBrowserPushMutationOptions(queryClient)
    const mutationFn = mutation.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')

    await expect(mutationFn(undefined, mutationContext)).rejects.toMatchObject({
      _tag: 'ChannelNotFoundForEndpointError',
    })
  })

  it('enable mutation throws when vapid request fails', async () => {
    stubPushEnvironment({ requestPermission: 'granted' })
    mockVapidGet.mockResolvedValue(pushGetResponse(false))

    const mutationFn = enableBrowserPushMutationOptions.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')

    await expect(mutationFn(undefined, mutationContext)).rejects.toMatchObject({
      _tag: 'PushChannelRequestError',
    })
  })

  it('enable mutation unsubscribes local subscription when channel creation fails', async () => {
    const subscription = createMockSubscription()
    stubPushEnvironment({
      requestPermission: 'granted',
      subscription,
    })
    mockVapidGet.mockResolvedValue(pushGetResponse(true))
    mockPushPost.mockResolvedValue(pushPostResponse(false))

    const mutationFn = enableBrowserPushMutationOptions.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')

    await expect(mutationFn(undefined, mutationContext)).rejects.toMatchObject({
      _tag: 'PushChannelRequestError',
    })
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  })

  it.each([
    'sign out',
    'switch wallet',
    'replace token',
  ])('does not create a channel after %s while permission is pending', async (change) => {
    const subscription = createMockSubscription()
    stubPushEnvironment({ permission: 'default', subscription })
    let finishPermission: (permission: NotificationPermission) => void = () =>
      undefined
    vi.mocked(Notification.requestPermission).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPermission = resolve
        }),
    )
    const mutationFn = enableBrowserPushMutationOptions.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')
    const pending = mutationFn(undefined, mutationContext)
    const rejected = expect(pending).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    await vi.waitFor(() =>
      expect(Notification.requestPermission).toHaveBeenCalledOnce(),
    )
    if (change === 'sign out') backendAuthStore.trigger.signOut()
    else
      backendAuthStore.trigger.signIn({
        authKey: 'session-b',
        address: change === 'switch wallet' ? '0xdef' : '0xabc',
      })
    finishPermission('granted')
    await rejected
    expect(mockVapidGet).not.toHaveBeenCalled()
    expect(mockPushPost).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('does not post or unsubscribe another session after pending subscription setup', async () => {
    const subscription = createMockSubscription()
    let finishSubscription: (value: PushSubscription) => void = () => undefined
    const subscribe = vi.fn(
      () =>
        new Promise<PushSubscription>((resolve) => {
          finishSubscription = resolve
        }),
    )
    stubPushEnvironment({ subscribeFn: subscribe })
    mockVapidGet.mockResolvedValue(pushGetResponse(true))
    const mutationFn = enableBrowserPushMutationOptions.mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')
    const pending = mutationFn(undefined, mutationContext)
    const rejected = expect(pending).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())
    backendAuthStore.trigger.signIn({ authKey: 'session-b', address: '0xdef' })
    finishSubscription(subscription)
    await rejected
    expect(mockPushPost).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('does not delete a channel after the login changes during channel lookup', async () => {
    const subscription = createMockSubscription()
    stubPushEnvironment({ subscription })
    const queryClient = {
      ensureQueryData: vi.fn(async () => {
        backendAuthStore.trigger.signIn({
          authKey: 'session-b',
          address: '0xdef',
        })
        return []
      }),
    } as unknown as QueryClient
    const mutationFn = disableBrowserPushMutationOptions(queryClient).mutationFn
    if (!mutationFn) throw new Error('Missing mutationFn')
    await expect(mutationFn(undefined, mutationContext)).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
})
