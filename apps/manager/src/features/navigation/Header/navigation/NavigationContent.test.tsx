import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsSetting, NavigationContent } from './NavigationContent'

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

describe('NavigationContent', () => {
  const renderMenu = async () => {
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <I18nProvider i18n={i18n}>
            <NavigationContent onAction={() => {}} />
          </I18nProvider>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    return render(<RouterProvider router={router} />)
  }

  it('links to the ens.domains homepage in a new tab', async () => {
    await renderMenu()
    const link = await screen.findByRole('link', { name: 'ENS Protocol ↗' })
    expect(link.getAttribute('href')).toBe('https://ens.domains')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('names the DAO Forum icon link for screen readers', async () => {
    await renderMenu()
    const link = await screen.findByRole('link', { name: 'DAO Forum' })
    expect(link.getAttribute('href')).toBe('https://discuss.ens.domains/')
  })

  it('links to each destination once', async () => {
    await renderMenu()
    const hrefs = (await screen.findAllByRole('link')).map((link) =>
      link.getAttribute('href'),
    )
    expect(hrefs).toEqual([...new Set(hrefs)])
  })
})
