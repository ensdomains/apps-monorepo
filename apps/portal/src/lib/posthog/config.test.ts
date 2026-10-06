// @vitest-environment happy-dom
import posthog, { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS_ONLY_CONFIG } from './config'
import { track, trackWithOptions } from './events'

const WALLET = '0x1111111111111111111111111111111111111111'

describe('feature-flags-only SDK network behavior', () => {
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

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('keeps wallet flags working without event requests (previous opt-in: %s, flag value: %s)', async (previousOptIn, enabled) => {
    const client = new PostHog()
    if (previousOptIn) localStorage.setItem('__ph_opt_in_out_test-key', '1')
    const requests = vi
      .spyOn(client, '_send_request')
      .mockImplementation((request) => {
        request.callback?.({
          statusCode: 200,
          json: {
            featureFlags: {
              migration: enabled,
              'migration-nft': enabled,
              i18n: enabled,
            },
            autocapture: true,
            sessionRecording: { endpoint: '/s/' },
            surveys: [{ id: 'survey' }],
            capturePerformance: true,
            autocaptureExceptions: true,
          },
        })
      })
    client.init('test-key', {
      api_host: 'https://posthog.example',
      ...FEATURE_FLAGS_ONLY_CONFIG,
    })
    client.identify(WALLET, { address: WALLET }, { initial_address: WALLET })
    client.reloadFeatureFlags()
    await vi.advanceTimersByTimeAsync(1000)

    expect(client.has_opted_out_capturing()).toBe(true)
    expect(client.get_distinct_id()).toBe(WALLET)
    for (const flag of ['migration', 'migration-nft', 'i18n']) {
      expect(client.isFeatureEnabled(flag)).toBe(enabled)
    }
    expect(
      requests.mock.calls.some(
        ([request]) =>
          request.url.includes('/flags/') &&
          !Array.isArray(request.data) &&
          request.data?.distinct_id === WALLET &&
          request.data?.person_properties.address === WALLET,
      ),
    ).toBe(true)

    const surveys = vi.fn()
    client.getSurveys(surveys)
    expect(surveys).toHaveBeenCalledWith([])
    client.capture('wallet:connect', { wallet_address: WALLET })
    client.capture('tm:failed_run', { private: 'transaction details' })
    client.captureException(new Error('test failure'))
    history.pushState({}, '', '/launch-test')
    document.body.click()
    window.dispatchEvent(new Event('pagehide'))
    expect(client.sessionRecordingStarted()).toBe(false)
    client.reset()
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.get_distinct_id()).not.toBe(WALLET)
    expect(client.has_opted_out_capturing()).toBe(true)
    expect(requests.mock.calls.length).toBeGreaterThan(0)
    expect(
      requests.mock.calls.every(
        ([request]) =>
          request.url.includes('/flags/') || request.url.includes('/config'),
      ),
    ).toBe(true)
  })

  it('blocks existing explicit helpers and capture even if code attempts to opt in', async () => {
    const requests = vi
      .spyOn(posthog, '_send_request')
      .mockImplementation(() => {})
    posthog.init('helpers-test-key', {
      api_host: 'https://posthog.example',
      ...FEATURE_FLAGS_ONLY_CONFIG,
    })
    requests.mockClear()
    track('wallet:connect', {
      wallet_address: WALLET,
      chain_id: 1,
      wallet_connector: 'test',
    })
    trackWithOptions('intercom:booted', undefined, {
      $set: { intercom_visitor_id: 'visitor' },
    })
    posthog.opt_in_capturing()
    posthog.capture('should-still-be-dropped')
    await vi.advanceTimersByTimeAsync(3000)
    expect(requests).not.toHaveBeenCalled()
    posthog.opt_out_capturing()
  })
})
