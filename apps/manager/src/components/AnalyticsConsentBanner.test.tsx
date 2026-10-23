import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner'

// PostHog, keeping the answer the way its consent cookie does.
const posthog = vi.hoisted(() => {
  const client = {
    __loaded: true,
    stored: 'pending',
    get_explicit_consent_status: () => client.stored,
    opt_in_capturing: () => {
      client.stored = 'granted'
    },
    opt_out_capturing: () => {
      client.stored = 'denied'
    },
    reset: () => {
      client.stored = 'pending'
    },
  }
  return client
})
vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: posthog }))

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderBanner = () =>
  render(
    <I18nProvider i18n={i18n}>
      <AnalyticsConsentBanner />
    </I18nProvider>,
  )

const queryBanner = () =>
  screen.queryByRole('region', { name: 'Analytics consent' })

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    posthog.__loaded = true
    posthog.stored = 'pending'
  })

  it.each([
    ['Yes, happy to help', 'granted'],
    ['No thanks', 'denied'],
  ] as const)('stores the answer on %s and goes away', (button, consent) => {
    renderBanner()
    expect(
      screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href'),
    ).toBe('https://ens.domains/legal/privacy-policy')

    fireEvent.click(screen.getByRole('button', { name: button }))

    expect(posthog.stored).toBe(consent)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden once answered', () => {
    posthog.stored = 'denied'
    renderBanner()
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden until PostHog loads', () => {
    posthog.__loaded = false
    renderBanner()
    expect(queryBanner()).toBeNull()
  })
})
