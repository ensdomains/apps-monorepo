// @vitest-environment happy-dom

import { setAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConfiguration'
import { ANALYTICS_CONSENT_COOKIE } from '@ens-apps/utils/posthog/analyticsConsent'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./events', () => ({ getConnectedWalletAddress: () => null }))

let POSTHOG_CONFIG: typeof import('./config').POSTHOG_CONFIG

const loadConfig = async () => {
  vi.resetModules()
  ;({ POSTHOG_CONFIG } = await import('./config'))
}

// A client that records its requests instead of sending them.
const initClient = () => {
  const client = new PostHog()
  const requests = vi
    .spyOn(client, '_send_request')
    .mockImplementation((request) => {
      request.callback?.({
        statusCode: 200,
        json: {
          featureFlags: { 'test-flag': true },
          sessionRecording: { endpoint: '/s/' },
          surveys: [{ id: 'survey' }],
        },
      })
    })
  client.init('test-key', {
    api_host: 'https://posthog.example',
    ...POSTHOG_CONFIG,
    // HappyDOM's user agent reads as a bot, which PostHog drops before any
    // consent check; without this every "no events" assertion passes vacuously.
    opt_out_useragent_filter: true,
  })
  return { client, requests }
}

type Requests = ReturnType<typeof initClient>['requests']

const onlyFlagRequests = (requests: Requests) =>
  requests.mock.calls.every(
    ([request]) =>
      request.url.includes('/flags/') || request.url.includes('/config'),
  )

describe('PostHog consent', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_ENS_NETWORK', 'sepolia')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'staging-test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_DEBUG', 'true')
    await loadConfig()
    await cookieStore.delete({ name: ANALYTICS_CONSENT_COOKIE, path: '/' })
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('wires shared consent, flags and Explorer metadata through the real SDK', async () => {
    const { client, requests } = initClient()
    client.capture('$pageview')
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.isFeatureEnabled('test-flag')).toBe(true)
    expect(client.get_explicit_consent_status()).toBe('pending')
    expect(onlyFlagRequests(requests)).toBe(true)

    setAnalyticsConsent(client, true)
    const event = client.capture('wallet:connect')
    expect(event?.properties.source_app).toBe('explorer')
    expect(event?.properties.analytics_version).toBe(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(onlyFlagRequests(requests)).toBe(false)

    setAnalyticsConsent(client, false)
    requests.mockClear()
    expect(client.capture('$pageview')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.get_explicit_consent_status()).toBe('denied')
    expect(onlyFlagRequests(requests)).toBe(true)
  })
})
