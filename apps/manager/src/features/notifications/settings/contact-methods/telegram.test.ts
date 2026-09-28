import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel } from '../../data/queries/channels'
import { TelegramContactMethod } from './telegram'

const pending: Channel = {
  id: 'synthetic-telegram',
  channel: 'telegram',
  label: '@synthetic_user',
  status: 'pending',
  status_reason: null,
  verified_at: null,
  last_sent_at: null,
  last_bounce_at: null,
  last_verification_sent_at: null,
}

describe('Telegram connection review', () => {
  let client: QueryClient
  const review = (telegram?: Channel) =>
    createElement(
      I18nProvider,
      { i18n },
      createElement(
        QueryClientProvider,
        { client },
        createElement(TelegramContactMethod, {
          proposedConnection: true,
          telegram,
        }),
      ),
    )
  beforeEach(() => {
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    client = new QueryClient()
  })
  afterEach(() => {
    cleanup()
    client.clear()
  })

  it('continues from authentication to the native bot link when the channel becomes pending', () => {
    const mounted = render(review())
    expect(
      screen.getByRole('button', { name: 'Telegram Notifications' }),
    ).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
    mounted.rerender(review(pending))
    const link = screen.getByRole('link', {
      name: 'start the ENS Notifications Bot',
    })
    expect(link.getAttribute('href')).toBe('https://t.me/ens_earl_bot?start')
    expect(screen.getByText('Pending verification')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows verified completion without offering disconnect for a connect request', () => {
    render(review({ ...pending, status: 'verified' }))
    expect(screen.getByText('Connected')).toBeDefined()
    expect(screen.getByText('@synthetic_user')).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('retains the ordinary settings removal control and pending verification link', () => {
    render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(
          QueryClientProvider,
          { client },
          createElement(TelegramContactMethod, { telegram: pending }),
        ),
      ),
    )
    expect(
      screen.getByRole('button', { name: '@synthetic_user close' }),
    ).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'start the ENS Notifications Bot' }),
    ).toBeDefined()
  })
})
