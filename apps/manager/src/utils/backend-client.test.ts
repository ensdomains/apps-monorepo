import posthog from 'posthog-js/dist/module.full.no-external'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backendAuthStore,
  backendClient,
  DEFAULT_BACKEND_API_URL,
  getBackendApiBaseUrl,
  resolveBackendApiBaseUrl,
} from './backend-client'

const ATTACKER_URL = 'https://attacker.example'

describe('resolveBackendApiBaseUrl', () => {
  it('returns the default URL when debug features are disabled', () => {
    expect(resolveBackendApiBaseUrl(ATTACKER_URL, false)).toBe(
      DEFAULT_BACKEND_API_URL,
    )
  })

  it('returns the override when debug features are enabled', () => {
    expect(resolveBackendApiBaseUrl(ATTACKER_URL, true)).toBe(ATTACKER_URL)
  })

  it('returns the default URL when debug features are enabled and no override is set', () => {
    expect(resolveBackendApiBaseUrl(undefined, true)).toBe(
      DEFAULT_BACKEND_API_URL,
    )
  })
})

describe('apiBaseUrlOverride when debug features are enabled', () => {
  afterEach(() => {
    backendAuthStore.trigger.clearApiBaseUrlOverride()
  })

  it('honors set and clear events', () => {
    backendAuthStore.trigger.setApiBaseUrlOverride({ url: ATTACKER_URL })

    expect(backendAuthStore.get().context.apiBaseUrlOverride).toBe(ATTACKER_URL)
    expect(getBackendApiBaseUrl()).toBe(ATTACKER_URL)

    backendAuthStore.trigger.clearApiBaseUrlOverride()

    expect(backendAuthStore.get().context.apiBaseUrlOverride).toBeUndefined()
    expect(getBackendApiBaseUrl()).toBe(DEFAULT_BACKEND_API_URL)
  })
})

describe('apiBaseUrlOverride when debug features are disabled', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('./debug-features')
    localStorage.clear()
  })

  it('ignores persisted override and no-ops setters', async () => {
    localStorage.setItem(
      '@manager-v4/backend_auth',
      JSON.stringify({
        context: {
          authKey: undefined,
          address: undefined,
          modalDismissed: false,
          apiBaseUrlOverride: ATTACKER_URL,
        },
      }),
    )

    vi.resetModules()
    vi.doMock('./debug-features', () => ({
      DEBUG_FEATURES_ENABLED: false,
    }))

    const {
      backendAuthStore: isolatedStore,
      getBackendApiBaseUrl: isolatedGetBackendApiBaseUrl,
      DEFAULT_BACKEND_API_URL: isolatedDefaultUrl,
    } = await import('./backend-client')

    expect(isolatedStore.get().context.apiBaseUrlOverride).toBeUndefined()
    expect(isolatedGetBackendApiBaseUrl()).toBe(isolatedDefaultUrl)

    isolatedStore.trigger.setApiBaseUrlOverride({ url: ATTACKER_URL })

    expect(isolatedStore.get().context.apiBaseUrlOverride).toBeUndefined()
    expect(isolatedGetBackendApiBaseUrl()).toBe(isolatedDefaultUrl)

    const persisted = JSON.parse(
      localStorage.getItem('@manager-v4/backend_auth') ?? '',
    )
    expect(persisted.context.apiBaseUrlOverride).toBeUndefined()
  })

  it('uses fallback context when persisted auth types are invalid', async () => {
    localStorage.setItem(
      '@manager-v4/backend_auth',
      JSON.stringify({
        context: {
          authKey: 42,
          address: '0xabc',
          modalDismissed: false,
        },
      }),
    )

    vi.resetModules()
    vi.doMock('./debug-features', () => ({
      DEBUG_FEATURES_ENABLED: false,
    }))

    const { backendAuthStore: isolatedStore } = await import('./backend-client')

    expect(isolatedStore.get().context.authKey).toBeUndefined()
    expect(isolatedStore.get().context.address).toBeUndefined()
  })
})

describe('optional analytics request headers', () => {
  const loadedDescriptor = Object.getOwnPropertyDescriptor(posthog, '__loaded')
  afterEach(() => {
    if (loadedDescriptor)
      Object.defineProperty(posthog, '__loaded', loadedDescriptor)
    backendAuthStore.trigger.signOut()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['consent', 'identity'] as const)(
    'still sends authenticated backend requests when %s reads throw',
    async (failure) => {
      Object.defineProperty(posthog, '__loaded', {
        configurable: true,
        value: true,
      })
      vi.spyOn(posthog, 'get_explicit_consent_status').mockImplementation(
        () => {
          if (failure === 'consent') throw new Error('SDK unavailable')
          return 'granted'
        },
      )
      vi.spyOn(posthog, 'get_distinct_id').mockImplementation(() => {
        throw new Error('SDK unavailable')
      })
      backendAuthStore.trigger.signIn({ authKey: 'auth-key', address: '0xabc' })
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}'))
      vi.stubGlobal('fetch', transport)

      const response =
        await backendClient.notifications.channels.telegram.oauth.$get()

      expect(response.status).toBe(200)
      expect(transport).toHaveBeenCalledOnce()
      const headers = new Headers(transport.mock.calls[0]?.[1]?.headers)
      expect(headers.get('Authorization')).toBe('Bearer auth-key')
      expect(headers.has('X-PostHog-Distinct-ID')).toBe(false)
    },
  )
})
