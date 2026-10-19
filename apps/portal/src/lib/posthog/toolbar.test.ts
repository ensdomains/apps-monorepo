// @vitest-environment happy-dom
// posthog-js is patched (patches/posthog-js@1.404.1.patch) so a crafted
// `#__posthog` link cannot load the PostHog toolbar, which can apply UI edits
// in the visitor's browser (WEB-1832). These tests fail if the patch stops
// applying, for example after a posthog-js upgrade.
import { PostHog as DefaultBuildPostHog } from 'posthog-js'
import posthog, { PostHog } from 'posthog-js/dist/module.full.no-external'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS_ONLY_CONFIG } from './config'

const TOKEN = 'phc_test_token'
const TOOLBAR_PARAMS_KEY = '_postHogToolbarParams'

const authorizeHash = (token: string): string =>
  `#__posthog=${encodeURIComponent(
    JSON.stringify({ action: 'ph_authorize', token, desiredHash: '' }),
  )}`

describe('PostHog toolbar patch', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    history.replaceState(null, '', `/${authorizeHash(TOKEN)}`)
  })
  afterEach(() => {
    history.replaceState(null, '', '/')
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('does not load the toolbar from an authorization hash when PostHog starts', () => {
    const client = new PostHog()
    const loadToolbar = vi.spyOn(client.toolbar, 'loadToolbar')
    client.init(TOKEN, {
      api_host: 'https://example.invalid',
      ...FEATURE_FLAGS_ONLY_CONFIG,
    })

    expect(client.toolbar.maybeLoadToolbar()).toBe(false)
    expect(loadToolbar).not.toHaveBeenCalled()
    expect(localStorage.getItem(TOOLBAR_PARAMS_KEY)).toBeNull()
    expect(document.querySelector('script[src*="toolbar.js"]')).toBeNull()
  })

  it('refuses an explicit toolbar load on the app singleton', () => {
    expect(posthog.toolbar.loadToolbar({ token: TOKEN })).toBe(false)
    expect(posthog.loadToolbar({ token: TOKEN })).toBe(false)
    expect(localStorage.getItem(TOOLBAR_PARAMS_KEY)).toBeNull()
  })

  it('is applied to the default posthog-js build too', () => {
    const client = new DefaultBuildPostHog()
    expect(client.toolbar.maybeLoadToolbar()).toBe(false)
    expect(client.toolbar.loadToolbar({ token: TOKEN })).toBe(false)
  })

  it('keeps feature flags working', () => {
    const client = new PostHog()
    client.init(TOKEN, {
      api_host: 'https://example.invalid',
      ...FEATURE_FLAGS_ONLY_CONFIG,
    })
    client.featureFlags.overrideFeatureFlags({
      flags: { 'toolbar-test-flag': true },
    })

    expect(client.isFeatureEnabled('toolbar-test-flag')).toBe(true)
  })
})
