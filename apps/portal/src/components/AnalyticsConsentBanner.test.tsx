import {
  connectAnalyticsConsent,
  readAnalyticsConsent,
  storeAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner'

const queryBanner = () =>
  screen.queryByRole('region', { name: 'Analytics consent' })

// Stands in for PostHog, which keeps the answer in a cookie.
const connectPostHog = (
  stored: 'granted' | 'denied' | 'pending' = 'pending',
) => {
  const cookie = { stored }
  connectAnalyticsConsent({
    get_explicit_consent_status: () => cookie.stored,
    opt_in_capturing: () => {
      cookie.stored = 'granted'
    },
    opt_out_capturing: () => {
      cookie.stored = 'denied'
    },
  })
  return cookie
}

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['Accept', 'granted'],
    ['Decline', 'denied'],
  ] as const)('stores the answer on %s and goes away', (button, consent) => {
    const cookie = connectPostHog()
    render(<AnalyticsConsentBanner />)
    expect(
      screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href'),
    ).toBe('https://ens.domains/legal/privacy-policy')

    fireEvent.click(screen.getByRole('button', { name: button }))

    expect(cookie.stored).toBe(consent)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden once answered', () => {
    connectPostHog('denied')
    render(<AnalyticsConsentBanner />)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden without a PostHog project', () => {
    connectPostHog()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')
    render(<AnalyticsConsentBanner />)
    expect(queryBanner()).toBeNull()
  })

  it('follows an answer given in another tab or app', () => {
    const cookie = connectPostHog()
    render(<AnalyticsConsentBanner />)

    cookie.stored = 'granted'
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(queryBanner()).toBeNull()
  })

  it('keeps the answer for this page when the browser refuses the cookie', () => {
    connectAnalyticsConsent({
      get_explicit_consent_status: () => 'pending',
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
    })
    render(<AnalyticsConsentBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(readAnalyticsConsent()).toBe('granted')
    expect(queryBanner()).toBeNull()
    // A stored answer clears the page one for the tests after this.
    connectPostHog()
    storeAnalyticsConsent('denied')
  })
})
