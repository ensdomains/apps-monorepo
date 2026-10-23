import {
  readAnalyticsConsent,
  storeAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner'

const queryBanner = () =>
  screen.queryByRole('region', { name: 'Analytics consent' })

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['Accept', 'granted'],
    ['Decline', 'denied'],
  ] as const)('stores the answer on %s and goes away', (button, consent) => {
    render(<AnalyticsConsentBanner />)
    expect(
      screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href'),
    ).toBe('https://ens.domains/legal/privacy-policy')

    fireEvent.click(screen.getByRole('button', { name: button }))

    expect(readAnalyticsConsent()).toBe(consent)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden once answered', () => {
    localStorage.setItem('analytics-consent', 'denied')
    render(<AnalyticsConsentBanner />)
    expect(queryBanner()).toBeNull()
  })

  it('stays hidden without a PostHog project', () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')
    render(<AnalyticsConsentBanner />)
    expect(queryBanner()).toBeNull()
  })

  it('follows an answer given in another tab', () => {
    render(<AnalyticsConsentBanner />)

    localStorage.setItem('analytics-consent', 'granted')
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'analytics-consent' }),
      )
    })

    expect(queryBanner()).toBeNull()
  })

  it('keeps the answer for this page when storage refuses it', () => {
    const setItem = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
    render(<AnalyticsConsentBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(readAnalyticsConsent()).toBe('granted')
    expect(queryBanner()).toBeNull()
    // A saved answer clears the in-memory one for the tests after this.
    setItem.mockRestore()
    storeAnalyticsConsent('denied')
  })
})
