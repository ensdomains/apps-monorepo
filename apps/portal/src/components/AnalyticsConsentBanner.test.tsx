import { act, fireEvent, render, screen } from '@testing-library/react'
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
    render(<AnalyticsConsentBanner />)
    expect(
      screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href'),
    ).toBe('https://ens.domains/legal/privacy-policy')

    fireEvent.click(screen.getByRole('button', { name: button }))

    expect(posthog.stored).toBe(consent)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden once answered', () => {
    posthog.stored = 'denied'
    render(<AnalyticsConsentBanner />)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden until PostHog loads', () => {
    posthog.__loaded = false
    render(<AnalyticsConsentBanner />)
    expect(queryBanner()).toBeNull()
  })

  it('follows an answer given in another tab or app', () => {
    render(<AnalyticsConsentBanner />)

    posthog.stored = 'granted'
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(queryBanner()).toBeNull()
  })
})
