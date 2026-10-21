// @vitest-environment happy-dom
// Fails if patches/posthog-js@*.patch stops applying (WEB-1832).
import { PostHog as DefaultBuildPostHog } from 'posthog-js'
import posthog, { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS_ONLY_CONFIG } from './config'

const TOKEN = 'phc_test_token'

const init = () => {
  const client = new PostHog()
  client.init(TOKEN, {
    api_host: 'https://example.invalid',
    ...FEATURE_FLAGS_ONLY_CONFIG,
  })
  return client
}

describe('PostHog toolbar patch', () => {
  afterEach(() => {
    history.replaceState(null, '', '/')
    localStorage.clear()
  })

  it('never loads the toolbar', () => {
    history.replaceState(
      null,
      '',
      `/#__posthog=${encodeURIComponent(
        JSON.stringify({
          action: 'ph_authorize',
          token: TOKEN,
          desiredHash: '',
        }),
      )}`,
    )
    init()

    expect(localStorage.getItem('_postHogToolbarParams')).toBeNull()
    expect(document.querySelector('script[src*="toolbar.js"]')).toBeNull()
    expect(posthog.loadToolbar({ token: TOKEN })).toBe(false)
    expect(
      new DefaultBuildPostHog().toolbar.loadToolbar({ token: TOKEN }),
    ).toBe(false)
  })

  it('keeps feature flags working', () => {
    const client = init()
    client.featureFlags.overrideFeatureFlags({ flags: { 'test-flag': true } })

    expect(client.isFeatureEnabled('test-flag')).toBe(true)
  })
})
