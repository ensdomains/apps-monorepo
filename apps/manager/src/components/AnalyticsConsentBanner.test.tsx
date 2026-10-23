import {
  connectAnalyticsConsent,
  readAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderBanner = () =>
  render(
    <I18nProvider i18n={i18n}>
      <AnalyticsConsentBanner />
    </I18nProvider>,
  )

const queryBanner = () =>
  screen.queryByRole('region', { name: 'Analytics consent' })

// Stands in for PostHog, which keeps the answer in a cookie.
const connectPostHog = (stored: 'granted' | 'denied' | 'pending') => {
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
}

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    connectPostHog('pending')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['Accept', 'granted'],
    ['Decline', 'denied'],
  ] as const)('stores the answer on %s and goes away', (button, consent) => {
    renderBanner()
    expect(
      screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href'),
    ).toBe('https://ens.domains/legal/privacy-policy')

    fireEvent.click(screen.getByRole('button', { name: button }))

    expect(readAnalyticsConsent()).toBe(consent)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden once answered', () => {
    connectPostHog('denied')
    renderBanner()
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden without a PostHog project', () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')
    renderBanner()
    expect(queryBanner()).toBeNull()
  })
})
