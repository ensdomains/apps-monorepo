// @vitest-environment happy-dom
import { storeAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAnalyticsConsent, POSTHOG_CONFIG } from './config'

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
          featureFlags: { migration: true },
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

const onlyFlagRequests = (
  requests: ReturnType<typeof initClient>['requests'],
) =>
  requests.mock.calls.every(
    ([request]) =>
      request.url.includes('/flags/') || request.url.includes('/config'),
  )

describe('PostHog consent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([false, true])(
    'keeps flags working and sends no events without consent (earlier PostHog opt-in: %s)',
    async (hasEarlierOptIn) => {
      if (hasEarlierOptIn) localStorage.setItem('__ph_opt_in_out_test-key', '1')
      const { client, requests } = initClient()

      client.identify(WALLET, { address: WALLET })
      client.reloadFeatureFlags()
      client.capture('wallet:connect', { wallet_address: WALLET })
      history.pushState({}, '', '/consent-test')
      await vi.advanceTimersByTimeAsync(3000)

      expect(client.isFeatureEnabled('migration')).toBe(true)
      expect(client.has_opted_out_capturing()).toBe(true)
      const surveys = vi.fn()
      client.getSurveys(surveys)
      expect(surveys).toHaveBeenCalledWith([])
      expect(onlyFlagRequests(requests)).toBe(true)
    },
  )

  it('sends events after the visitor accepts, including after a reset', async () => {
    const { client, requests } = initClient()

    storeAnalyticsConsent('granted')
    applyAnalyticsConsent(client)
    client.capture('wallet:connect', { wallet_address: WALLET })
    await vi.advanceTimersByTimeAsync(3000)
    expect(onlyFlagRequests(requests)).toBe(false)

    // reset() drops the opt-in; applying consent again restores it.
    client.reset()
    applyAnalyticsConsent(client)
    expect(client.has_opted_out_capturing()).toBe(false)
  })

  it('stops sending events when the visitor declines', async () => {
    storeAnalyticsConsent('granted')
    const { client, requests } = initClient()
    await vi.advanceTimersByTimeAsync(3000)

    storeAnalyticsConsent('denied')
    applyAnalyticsConsent(client)
    requests.mockClear()
    client.capture('wallet:connect', { wallet_address: WALLET })
    await vi.advanceTimersByTimeAsync(3000)

    expect(client.has_opted_out_capturing()).toBe(true)
    expect(onlyFlagRequests(requests)).toBe(true)
  })
})
