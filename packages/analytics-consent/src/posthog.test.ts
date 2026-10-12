// @vitest-environment happy-dom
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeConsent } from './consent.js'
import {
  ANONYMOUS_POSTHOG_CONFIG,
  type AnalyticsClient,
  applyAcceptedConsent,
  applyDeclinedConsent,
  CONSENTED_POSTHOG_CONFIG,
  configForConsent,
  sweepPosthogStorage,
} from './posthog.js'

const WALLET = '0x1111111111111111111111111111111111111111'

// happy-dom's user agent trips the SDK's bot filter and drops every capture,
// which would make suppression tests pass for the wrong reason. The bypass
// below is test-only: it disables bot filtering alone, so what remains under
// test is the consent mechanics. Real browsers are not bots.
const TEST_ONLY_UA_BYPASS = { opt_out_useragent_filter: true } as const

type SentRequest = { url: string; data: unknown }

const flagsResponder = (request: {
  url: string
  data?: unknown
  callback?: (response: {
    statusCode: number
    json: Record<string, unknown>
  }) => void
}) => {
  request.callback?.({
    statusCode: 200,
    json: {
      featureFlags: { migration: true },
      sessionRecording: false,
      surveys: false,
      capturePerformance: false,
      autocaptureExceptions: false,
    },
  })
}

const initClient = (
  key: string,
  config: typeof ANONYMOUS_POSTHOG_CONFIG | typeof CONSENTED_POSTHOG_CONFIG,
): { client: PostHog; requests: ReturnType<typeof vi.spyOn> } => {
  const client = new PostHog()
  const requests = vi
    .spyOn(client, '_send_request')
    .mockImplementation(flagsResponder)
  client.init(key, {
    api_host: 'https://posthog.example',
    ...config,
    ...TEST_ONLY_UA_BYPASS,
  })
  return { client, requests }
}

const requestUrls = (requests: { mock: { calls: [SentRequest][] } }) =>
  requests.mock.calls.map(([request]) => request.url)

const requestText = (request: SentRequest): string =>
  JSON.stringify(request.data) ?? ''

const eventNames = (requests: { mock: { calls: [SentRequest][] } }) => {
  const names: string[] = []
  for (const [request] of requests.mock.calls) {
    if (!request.url.includes('/e/')) continue
    const data = request.data as { batch?: { event?: unknown }[] }
    const batch = Array.isArray(data) ? data : (data.batch ?? [data])
    for (const entry of batch) {
      if (typeof entry?.event === 'string') names.push(entry.event)
    }
  }
  return names
}

const posthogKeys = () => ({
  local: Object.keys(localStorage).filter(
    (key) => key.startsWith('ph_') || key.startsWith('__ph_'),
  ),
  session: Object.keys(sessionStorage).filter(
    (key) => key.startsWith('ph_') || key.startsWith('__ph_'),
  ),
  cookie: document.cookie,
})

describe('consent PostHog configs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('treats no choice as declined when choosing a config', () => {
    expect(configForConsent(null)).toBe(ANONYMOUS_POSTHOG_CONFIG)
    expect(configForConsent('declined')).toBe(ANONYMOUS_POSTHOG_CONFIG)
    expect(configForConsent('accepted')).toBe(CONSENTED_POSTHOG_CONFIG)
  })

  it('anonymous init sends only config and anonymous flag requests and stores nothing', async () => {
    const { client, requests } = initClient(
      'anon-key',
      ANONYMOUS_POSTHOG_CONFIG,
    )
    client.reloadFeatureFlags()
    history.pushState({}, '', '/some-page')
    client.capture('should-be-dropped', {})
    document.body.click()
    await vi.advanceTimersByTimeAsync(8000)

    expect(client.has_opted_out_capturing()).toBe(true)
    expect(client.isFeatureEnabled('migration')).toBe(true)
    expect(
      requestUrls(requests).every(
        (url) => url.includes('/config') || url.includes('/flags'),
      ),
    ).toBe(true)
    expect(requestUrls(requests).length).toBeGreaterThan(0)
    expect(
      requests.mock.calls.every(
        ([request]: [SentRequest]) => !requestText(request).includes(WALLET),
      ),
    ).toBe(true)
    expect(posthogKeys()).toEqual({ local: [], session: [], cookie: '' })
  })

  it('a stale opt-in overrides the anonymous defaults unless swept first', async () => {
    localStorage.setItem('__ph_opt_in_out_stale-key', '1')
    const { client } = initClient('stale-key', ANONYMOUS_POSTHOG_CONFIG)
    await vi.advanceTimersByTimeAsync(500)
    // The stored opt-in wins over the by-default opt-outs: this is why the
    // apps sweep PostHog storage before an anonymous init.
    expect(client.has_opted_out_capturing()).toBe(false)
  })

  it('a stale wallet identity is dropped by the sweep, not reused for flags', async () => {
    localStorage.setItem(
      'ph_swept-key_posthog',
      JSON.stringify({ distinct_id: WALLET }),
    )
    localStorage.setItem('__ph_opt_in_out_swept-key', '1')
    sweepPosthogStorage()
    const { client, requests } = initClient(
      'swept-key',
      ANONYMOUS_POSTHOG_CONFIG,
    )
    client.reloadFeatureFlags()
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.has_opted_out_capturing()).toBe(true)
    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(
      requests.mock.calls.every(
        ([request]: [SentRequest]) => !requestText(request).includes(WALLET),
      ),
    ).toBe(true)
    expect(posthogKeys()).toEqual({ local: [], session: [], cookie: '' })
  })

  it('accept starts capture at once and links the wallet', async () => {
    writeConsent('accepted')
    const { client, requests } = initClient(
      'accept-key',
      ANONYMOUS_POSTHOG_CONFIG,
    )
    await vi.advanceTimersByTimeAsync(500)
    requests.mockClear()
    applyAcceptedConsent(client, WALLET)
    await vi.advanceTimersByTimeAsync(3000)

    expect(client.has_opted_out_capturing()).toBe(false)
    const names = eventNames(requests)
    expect(names).toContain('$pageview')
    expect(
      requests.mock.calls.some(
        ([request]: [SentRequest]) =>
          request.url.includes('/e/') && requestText(request).includes(WALLET),
      ),
    ).toBe(true)
  })

  it('a pre-consent capture never flushes after opting in', async () => {
    writeConsent('accepted')
    const { client, requests } = initClient(
      'queue-key',
      ANONYMOUS_POSTHOG_CONFIG,
    )
    await vi.advanceTimersByTimeAsync(500)
    client.capture('pre-consent-event', {})
    await vi.advanceTimersByTimeAsync(1000)
    requests.mockClear()
    applyAcceptedConsent(client, null)
    client.capture('post-consent-event', {})
    await vi.advanceTimersByTimeAsync(8000)
    const names = eventNames(requests)
    expect(names).not.toContain('pre-consent-event')
    expect(names).toContain('post-consent-event')
  })

  it('decline stops events at once and restores anonymous storage', async () => {
    writeConsent('accepted')
    const { client, requests } = initClient(
      'decline-key',
      ANONYMOUS_POSTHOG_CONFIG,
    )
    await vi.advanceTimersByTimeAsync(500)
    applyAcceptedConsent(client, WALLET)
    client.capture('some-event', {})
    await vi.advanceTimersByTimeAsync(1000)

    writeConsent('declined')
    applyDeclinedConsent(client)
    await vi.advanceTimersByTimeAsync(200)
    requests.mockClear()
    client.reloadFeatureFlags()
    client.capture('after-decline', {})
    history.pushState({}, '', '/after-decline')
    document.body.click()
    await vi.advanceTimersByTimeAsync(8000)

    expect(client.has_opted_out_capturing()).toBe(true)
    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(requestUrls(requests)).toEqual([expect.stringContaining('/flags/')])
    expect(
      requests.mock.calls.every(
        ([request]: [SentRequest]) => !requestText(request).includes(WALLET),
      ),
    ).toBe(true)
    expect(eventNames(requests)).toEqual([])
    expect(posthogKeys()).toEqual({ local: [], session: [], cookie: '' })
  })

  it('reset alone preserves the anonymous opt-out and clean storage', async () => {
    const { client } = initClient('reset-key', ANONYMOUS_POSTHOG_CONFIG)
    await vi.advanceTimersByTimeAsync(500)
    client.reset()
    await vi.advanceTimersByTimeAsync(1000)
    // Disconnects call reset() unconditionally; under the anonymous init
    // defaults it must not opt the SDK back in or write anything.
    expect(client.has_opted_out_capturing()).toBe(true)
    expect(posthogKeys()).toEqual({ local: [], session: [], cookie: '' })
  })

  it('the guard drops events unless the stored choice is accepted', async () => {
    writeConsent('declined')
    const declined = initClient('guard-declined', CONSENTED_POSTHOG_CONFIG)
    declined.client.capture('guarded-event', {})
    const missing = initClient('guard-missing', CONSENTED_POSTHOG_CONFIG)
    localStorage.clear()
    missing.client.capture('guarded-event', {})
    await vi.advanceTimersByTimeAsync(3000)
    expect(eventNames(declined.requests)).toEqual([])
    expect(eventNames(missing.requests)).toEqual([])

    writeConsent('accepted')
    const accepted = initClient('guard-accepted', CONSENTED_POSTHOG_CONFIG)
    accepted.client.capture('guarded-event', {})
    await vi.advanceTimersByTimeAsync(3000)
    expect(eventNames(accepted.requests)).toContain('guarded-event')
  })

  it('accepted init captures page views and usage events', async () => {
    writeConsent('accepted')
    const { client, requests } = initClient(
      'consented-key',
      CONSENTED_POSTHOG_CONFIG,
    )
    client.capture('name:search_selected', { name: 'nick.eth' })
    history.pushState({}, '', '/nick.eth')
    await vi.advanceTimersByTimeAsync(3000)
    const names = eventNames(requests)
    expect(names).toContain('$pageview')
    expect(names).toContain('name:search_selected')
    expect(client.has_opted_out_capturing()).toBe(false)
  })

  it('drives the client in the verified order', () => {
    const calls: string[] = []
    const client: AnalyticsClient = {
      opt_in_capturing: () => calls.push('opt_in'),
      opt_out_capturing: () => calls.push('opt_out'),
      reset: () => calls.push('reset'),
      identify: () => calls.push('identify'),
    }
    applyAcceptedConsent(client, WALLET)
    expect(calls).toEqual(['opt_in', 'identify'])
    calls.length = 0
    applyAcceptedConsent(client, null)
    expect(calls).toEqual(['opt_in'])
    calls.length = 0
    applyDeclinedConsent(client)
    expect(calls).toEqual(['reset', 'opt_out'])
  })
})
