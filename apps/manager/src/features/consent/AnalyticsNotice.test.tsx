// @vitest-environment happy-dom

import {
  CONSENT_STORAGE_KEY,
  readConsent,
} from '@ens-apps/analytics-consent/consent'
import { DELETION_EMAIL } from '@ens-apps/analytics-consent/wording'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import {
  AnalyticsNotice,
  MANAGER_USAGE_EVENTS_PARAGRAPH,
} from './AnalyticsNotice'

describe('AnalyticsNotice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('names the collection, the purposes, the processor and deletion', () => {
    render(<AnalyticsNotice />)
    for (const phrase of [
      /wallet addresses/i,
      /browser details/i,
      /page visits/i,
      /purposes/i,
    ]) {
      expect(screen.getByText(phrase)).toBeInTheDocument()
    }
    expect(screen.getAllByText(/usage events/i)).toHaveLength(3)
    expect(screen.getAllByText(/PostHog/).length).toBeGreaterThan(0)
    expect(
      screen.getByText(DELETION_EMAIL, { exact: false }),
    ).toBeInTheDocument()
    expect(screen.getByText(MANAGER_USAGE_EVENTS_PARAGRAPH)).toBeInTheDocument()
  })

  it('shows no choice with the switch off until the visitor chooses', () => {
    render(<AnalyticsNotice />)
    expect(screen.getByText('You have made no choice yet.')).toBeInTheDocument()
    expect(screen.getByTestId('analytics-consent-switch')).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('reflects a stored accepted choice', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    render(<AnalyticsNotice />)
    expect(screen.getByText('Analytics are on.')).toBeInTheDocument()
    expect(screen.getByTestId('analytics-consent-switch')).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('switches the choice both ways', () => {
    render(<AnalyticsNotice />)
    fireEvent.click(screen.getByTestId('analytics-consent-switch'))
    expect(readConsent()).toBe('accepted')
    expect(screen.getByText('Analytics are on.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('analytics-consent-switch'))
    expect(readConsent()).toBe('declined')
    expect(screen.getByText('Analytics are off.')).toBeInTheDocument()
  })
})
