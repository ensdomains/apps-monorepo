// @vitest-environment happy-dom
import { ANALYTICS_CONSENT_COOKIE } from '@ens-apps/utils/posthog/analyticsConsent'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyAnalyticsConsent,
  POSTHOG_CONFIG,
  resetKeepingConsent,
  setAnalyticsConsent,
} from './config'
import { getConnectedWalletAddress } from './events'

vi.mock('./events', () => ({ getConnectedWalletAddress: vi.fn(() => null) }))

const WALLET = '0x1111111111111111111111111111111111111111'

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

const flagBodies = (requests: Requests) =>
  requests.mock.calls.flatMap(([request]) =>
    request.url.includes('/flags/') && !Array.isArray(request.data)
      ? [request.data]
      : [],
  )

describe('PostHog consent', () => {
  beforeEach(async () => {
    vi.mocked(getConnectedWalletAddress).mockReturnValue(null)
    vi.stubEnv('VITE_PUBLIC_ANALYTICS_ENV', 'staging')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_STAGING_KEY', 'staging-test-key')
    vi.stubEnv('VITE_PUBLIC_ANALYTICS_DEBUG', 'true')
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

  it.each([false, true])(
    'keeps flags working and sends no events without consent (earlier PostHog opt-in: %s)',
    async (hasEarlierOptIn) => {
      if (hasEarlierOptIn) localStorage.setItem('__ph_opt_in_out_test-key', '1')
      const { client, requests } = initClient()

      client.capture('wallet:connect', { wallet_address: WALLET })
      history.pushState({}, '', '/consent-test')
      await vi.advanceTimersByTimeAsync(3000)

      expect(client.isFeatureEnabled('test-flag')).toBe(true)
      expect(client.has_opted_out_capturing()).toBe(true)
      // Loading must not answer for the visitor: that answer is every app's.
      expect(client.get_explicit_consent_status()).toBe('pending')
      const surveys = vi.fn()
      client.getSurveys(surveys)
      expect(surveys).toHaveBeenCalledWith([])
      expect(onlyFlagRequests(requests)).toBe(true)
    },
  )

  it('makes a visitor identified before the banner anonymous before flags load', async () => {
    // The pre-banner app identified every connected wallet.
    initClient().client.identify(WALLET)

    const { client, requests } = initClient()
    await vi.advanceTimersByTimeAsync(3000)

    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(flagBodies(requests).length).toBeGreaterThan(0)
    expect(
      flagBodies(requests).every((body) => body?.distinct_id !== WALLET),
    ).toBe(true)
  })

  it('filters native page payloads and drops ordinary autocapture before transport', () => {
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    history.pushState({}, '', '/alice.eth/records?signature=private#secret')
    const pageview = client.capture('$pageview')
    expect(pageview?.properties.$current_url).toBe(
      'http://localhost:3000/:value/records',
    )
    expect(pageview?.properties.$title).toBeUndefined()
    expect(
      client.capture('$autocapture', { $el_text: 'private' }),
    ).toBeUndefined()
  })

  it('keeps feature flags working while local analytics is disabled despite consent', async () => {
    vi.stubEnv('VITE_PUBLIC_ANALYTICS_DEBUG', '')
    const { client, requests } = initClient()
    setAnalyticsConsent(client, true)
    client.capture('wallet:connect')
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.isFeatureEnabled('test-flag')).toBe(true)
    expect(onlyFlagRequests(requests)).toBe(true)
  })

  it('drops native events during the wallet identity synchronization gap', () => {
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    vi.mocked(getConnectedWalletAddress).mockReturnValue(WALLET)
    expect(client.capture('$pageview')).toBeUndefined()
    client.identify(WALLET)
    expect(client.capture('$pageview')?.properties.distinct_id).toBe(WALLET)
    vi.mocked(getConnectedWalletAddress).mockReturnValue(undefined)
    expect(client.capture('$pageleave')).toBeUndefined()
  })

  it('keeps the answer in the cookie the ens.domains apps share', () => {
    setAnalyticsConsent(initClient().client, true)

    expect(document.cookie).toContain(`${ANALYTICS_CONSENT_COOKIE}=1`)
    // Another app's PostHog starts with the same answer.
    expect(initClient().client.get_explicit_consent_status()).toBe('granted')
  })

  it('sends events after the visitor accepts, and keeps the answer through a reset', async () => {
    const { client, requests } = initClient()

    setAnalyticsConsent(client, true)
    client.capture('wallet:connect', { wallet_address: WALLET })
    await vi.advanceTimersByTimeAsync(3000)
    expect(onlyFlagRequests(requests)).toBe(false)

    // A plain reset() deletes the answer, for every app sharing the cookie.
    resetKeepingConsent(client)
    expect(client.get_explicit_consent_status()).toBe('granted')
    expect(client.has_opted_out_capturing()).toBe(false)
  })

  it('stops sending events and forgets the wallet when the visitor declines', async () => {
    const { client, requests } = initClient()
    setAnalyticsConsent(client, true)
    client.identify(WALLET)
    await vi.advanceTimersByTimeAsync(3000)

    setAnalyticsConsent(client, false)
    requests.mockClear()
    client.capture('wallet:connect', { wallet_address: WALLET })
    await vi.advanceTimersByTimeAsync(3000)

    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(client.has_opted_out_capturing()).toBe(true)
    expect(onlyFlagRequests(requests)).toBe(true)
  })

  it('forgets the wallet once another tab or app declines', () => {
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    client.identify(WALLET)

    // Another tab or app declines: the shared cookie now says no.
    client.opt_out_capturing()
    applyAnalyticsConsent(client)

    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(client.get_explicit_consent_status()).toBe('denied')
  })
})
