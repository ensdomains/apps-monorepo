import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsSetting } from './NavigationContent'

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

const renderSetting = () =>
  render(
    <I18nProvider i18n={i18n}>
      <AnalyticsSetting />
    </I18nProvider>,
  )

describe('AnalyticsSetting', () => {
  beforeEach(() => {
    posthog.__loaded = true
    posthog.stored = 'pending'
  })

  it('turns sharing usage data on and off', () => {
    renderSetting()
    const toggle = screen.getByRole('switch', { name: 'Share usage data' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)
    expect(posthog.stored).toBe('granted')
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    expect(posthog.stored).toBe('denied')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('stays hidden until PostHog loads', () => {
    posthog.__loaded = false
    renderSetting()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
