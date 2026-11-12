// @vitest-environment happy-dom

import {
  applyAnalyticsConsent,
  resetKeepingConsent,
  setAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConfiguration'
import { ANALYTICS_CONSENT_COOKIE } from '@ens-apps/utils/posthog/analyticsConsent'
import { createAnalyticsTracker } from '@ens-apps/utils/posthog/createAnalyticsTracker'
import { synchronizeAnalyticsIdentity } from '@ens-apps/utils/posthog/identitySync'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { getAddress } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectedWalletAddress } from './events'

vi.mock('./events', () => ({ getConnectedWalletAddress: vi.fn(() => null) }))

let POSTHOG_CONFIG: typeof import('./config').POSTHOG_CONFIG

const loadConfig = async () => {
  vi.resetModules()
  ;({ POSTHOG_CONFIG } = await import('./config'))
}

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
    document.title = ''
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

  it('captures manual and unhandled exceptions after consent with their message and stack', async () => {
    const { client, requests } = initClient()
    expect(client.captureException(new Error('before consent'))).toBeUndefined()
    setAnalyticsConsent(client, true)
    const captured = client.captureException(new Error('render failure'))
    expect(captured?.event).toBe('$exception')
    expect(captured?.properties.$exception_list[0].value).toBe('render failure')
    expect(
      captured?.properties.$exception_list[0].stacktrace.frames.some(
        (frame: { readonly filename?: string }) =>
          frame.filename?.includes('config.test.ts'),
      ),
    ).toBe(true)
    // HappyDOM dispatches ErrorEvent differently from the browser's five-argument handler.
    window.onerror?.(
      'unhandled failure',
      location.href,
      1,
      1,
      new Error('unhandled failure'),
    )
    await vi.advanceTimersByTimeAsync(3000)
    const exceptions = requests.mock.calls
      .flatMap(([request]) =>
        Array.isArray(request.data) ? request.data : [request.data],
      )
      .filter((event) => event?.event === '$exception')
    expect(
      exceptions.some(
        (event) =>
          event?.properties.$exception_list[0].value === 'unhandled failure',
      ),
    ).toBe(true)
    expect(JSON.stringify(exceptions)).not.toContain('before consent')
    setAnalyticsConsent(client, false)
    expect(
      client.captureException(new Error('after withdrawal')),
    ).toBeUndefined()
  })

  it('preserves native page context and drops ordinary autocapture before transport', () => {
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    history.pushState({}, '', '/alice.eth/records?signature=private#secret')
    document.title = 'alice.eth | ENS App'
    const pageview = client.capture('$pageview', {
      source_app: 'spoofed',
      analytics_version: 9,
    })
    expect(pageview?.properties.$current_url).toBe(
      'http://localhost:3000/alice.eth/records?signature=%5Bredacted%5D#secret',
    )
    expect(pageview?.properties.source_app).toBe('manager')
    expect(pageview?.properties.analytics_version).toBe(1)
    expect(pageview?.properties.$title).toBeUndefined()
    expect(pageview?.properties.title).toBe('alice.eth | ENS App')
    expect(
      client.capture('$autocapture', { $el_text: 'private' }),
    ).toBeUndefined()
  })

  it('filters person properties across the entire outgoing identify envelope', async () => {
    history.replaceState(
      {},
      '',
      '/alice.eth/records?signature=private&utm_campaign=secret-campaign&gclid=secret-ad#secret-fragment',
    )
    const { client, requests } = initClient()
    setAnalyticsConsent(client, true)
    vi.mocked(getConnectedWalletAddress).mockReturnValue(WALLET)
    client.identify(
      WALLET,
      { $current_url: location.href },
      {
        $initial_current_url: location.href,
        $initial_utm_campaign: 'secret-campaign',
      },
    )
    await vi.advanceTimersByTimeAsync(3000)

    const envelopes = requests.mock.calls.flatMap(([request]) =>
      Array.isArray(request.data) ? request.data : [request.data],
    )
    const identify = envelopes.find((event) => event?.event === '$identify')
    expect(identify?.properties.distinct_id).toBe(WALLET)
    expect(JSON.stringify(identify)).not.toMatch(/signature=private/)
    expect(
      identify?.$set_once?.$initial_utm_campaign ??
        identify?.properties?.$set_once?.$initial_utm_campaign,
    ).toBe('secret-campaign')
    expect(JSON.stringify(identify)).toContain('alice.eth')
    expect(JSON.stringify(identify)).toContain('secret-ad')
  })

  it('preserves persisted attribution and flag targeting while analytics capture is disabled', async () => {
    history.replaceState(
      {},
      '',
      '/bob.eth/records?secret=raw&utm_campaign=flag-private#flag-fragment',
    )
    const earlier = initClient().client
    setAnalyticsConsent(earlier, true)
    earlier.register({
      $initial_person_info: {
        u: location.href,
        r: 'https://search.example/private-referrer',
      },
      $initial_campaign_params: { utm_campaign: 'legacy-private' },
      $initial_referrer_info: {
        $referrer: 'https://search.example/private-referrer',
      },
      $stored_person_properties: {
        feature_tier: 'preview',
        $current_url: location.href,
        $session_entry_utm_campaign: 'stored-private',
        gclid: 'stored-ad',
        api_key: 'private-flag-credential',
      },
    })
    vi.stubEnv('VITE_PUBLIC_POSTHOG_DEBUG', '')
    await loadConfig()
    const { client, requests } = initClient()
    expect(client.capture('$pageview')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(3000)
    client.reloadFeatureFlags()
    await vi.advanceTimersByTimeAsync(10)

    const bodies = flagBodies(requests)
    expect(bodies.length).toBeGreaterThanOrEqual(2)
    expect(client.isFeatureEnabled('test-flag')).toBe(true)
    expect(bodies[0]?.person_properties?.feature_tier).toBe('preview')
    expect(bodies[0]?.person_properties?.gclid).toBe('stored-ad')
    expect(JSON.stringify(bodies)).not.toContain('private-flag-credential')
    expect(bodies[0]?.person_properties?.$current_url).toContain(
      '/bob.eth/records',
    )
    expect(client.get_property('$initial_campaign_params')).toEqual({
      utm_campaign: 'legacy-private',
    })
  })

  it('checks native shared consent at send time without a generation cookie', () => {
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    const tracker = createAnalyticsTracker({
      client,
      getConnectedWalletAddress: () => null,
    })
    const operation = tracker.startAnalyticsOperation()
    const otherClient = initClient().client
    setAnalyticsConsent(otherClient, false)
    const capture = vi.spyOn(client, 'capture')
    operation.capture('profile:records_update', { chain_id: 1 })
    expect(capture).not.toHaveBeenCalled()
    setAnalyticsConsent(otherClient, true)
    operation.capture('profile:records_update', { chain_id: 1 })
    expect(capture).toHaveBeenCalledExactlyOnceWith('profile:records_update', {
      chain_id: 1,
    })
  })

  it('keeps feature flags working while local analytics is disabled despite consent', async () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_DEBUG', '')
    await loadConfig()
    const { client, requests } = initClient()
    setAnalyticsConsent(client, true)
    client.capture('wallet:connect')
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.isFeatureEnabled('test-flag')).toBe(true)
    expect(onlyFlagRequests(requests)).toBe(true)
  })

  it('retains native initial opt-in pageview before wallet identification and merges its anonymous identity', async () => {
    const { client } = initClient()
    const events: {
      readonly event: string
      readonly properties: Record<string, unknown>
    }[] = []
    client.on('eventCaptured', (event) => {
      events.push(event)
    })
    const anonymousId = client.get_distinct_id()
    vi.mocked(getConnectedWalletAddress).mockReturnValue(WALLET)
    setAnalyticsConsent(client, true)
    client.identify(WALLET)
    await vi.advanceTimersByTimeAsync(3000)
    expect(
      events
        .filter(({ event }) => event === '$pageview')
        .map(({ properties }) => properties.distinct_id),
    ).toEqual([anonymousId])
    expect(
      events.find(({ event }) => event === '$identify')?.properties
        .$anon_distinct_id,
    ).toBe(anonymousId)
    vi.mocked(getConnectedWalletAddress).mockReturnValue(undefined)
    expect(client.capture('$pageleave')).toBeUndefined()
  })

  it.each([
    {
      restoredWallet: WALLET,
      hasSameSession: true,
      campaign: 'returning-visitor',
    },
    {
      restoredWallet: '0x2222222222222222222222222222222222222222',
      hasSameSession: false,
      campaign: undefined,
    },
  ])(
    'defers native initial pageview until persisted wallet restoration resolves to $restoredWallet',
    async ({ restoredWallet, hasSameSession, campaign }) => {
      const original = initClient().client
      setAnalyticsConsent(original, true)
      vi.mocked(getConnectedWalletAddress).mockReturnValue(WALLET)
      original.identify(WALLET)
      original.register({ utm_campaign: 'returning-visitor' })
      const originalSession = original.get_session_id()
      vi.mocked(getConnectedWalletAddress).mockReturnValue(undefined)
      const { client, requests } = initClient()
      await vi.advanceTimersByTimeAsync(3000)
      expect(client.get_distinct_id()).toBe(WALLET)
      const capturedEvents = () =>
        requests.mock.calls.flatMap(([request]) =>
          Array.isArray(request.data) ? request.data : [request.data],
        )
      expect(
        capturedEvents().filter((event) => event?.event === '$pageview'),
      ).toEqual([])
      vi.mocked(getConnectedWalletAddress).mockReturnValue(restoredWallet)
      synchronizeAnalyticsIdentity(client, restoredWallet, true)
      synchronizeAnalyticsIdentity(client, restoredWallet, true)
      await vi.advanceTimersByTimeAsync(3000)
      const pageviews = capturedEvents().filter(
        (event) => event?.event === '$pageview',
      )
      expect(pageviews.map((event) => event.properties.distinct_id)).toEqual([
        restoredWallet,
      ])
      expect(client.get_session_id() === originalSession).toBe(hasSameSession)
      expect(client.get_property('utm_campaign')).toBe(campaign)
      history.pushState({}, '', `/restored-${restoredWallet.slice(-1)}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.advanceTimersByTimeAsync(3000)
      expect(
        capturedEvents().filter((event) => event?.event === '$pageview'),
      ).toHaveLength(2)
    },
  )

  it('preserves legacy checksummed identity, campaign and session through synchronization', () => {
    const wallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    const legacyId = getAddress(wallet)
    vi.mocked(getConnectedWalletAddress).mockReturnValue(wallet)
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    client.identify(
      legacyId,
      { address: legacyId },
      { initial_address: legacyId },
    )
    client.register({ utm_campaign: 'legacy-campaign' })
    const session = client.get_session_id()
    const reset = vi.spyOn(client, 'reset')
    synchronizeAnalyticsIdentity(client, wallet, true)
    expect(reset).not.toHaveBeenCalled()
    expect(client.get_distinct_id()).toBe(legacyId)
    expect(client.get_session_id()).toBe(session)
    expect(client.get_property('utm_campaign')).toBe('legacy-campaign')
    expect(client.capture('wallet:connect')?.properties.distinct_id).toBe(
      legacyId,
    )
  })

  it('contains errors in the SDK loaded callback', () => {
    const { client } = initClient()
    vi.spyOn(client, 'set_config').mockImplementation(() => {
      throw new Error('SDK unavailable')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => POSTHOG_CONFIG.loaded(client)).not.toThrow()
  })

  it('declines analytics even if resetting the SDK identity fails', () => {
    const { client } = initClient()
    setAnalyticsConsent(client, true)
    vi.spyOn(client, 'reset').mockImplementation(() => {
      throw new Error('SDK unavailable')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    setAnalyticsConsent(client, false)

    expect(client.get_explicit_consent_status()).toBe('denied')
    expect(client.has_opted_out_capturing()).toBe(true)
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
    initClient()
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
