import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backendAuthStore,
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
