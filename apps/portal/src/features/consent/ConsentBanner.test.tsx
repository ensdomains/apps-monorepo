// @vitest-environment happy-dom

import {
  CONSENT_STORAGE_KEY,
  readConsent,
} from '@ens-apps/analytics-consent/consent'
import { consentBanner } from '@ens-apps/analytics-consent/wording'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, userEvent } from '@/test-utils'
import { ConsentBanner } from './ConsentBanner'

const renderBanner = async () => {
  const rootRoute = createRootRoute({ component: () => <ConsentBanner /> })
  const privacyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/privacy',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([privacyRoute]),
  })
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

describe('ConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('offers equal accept and decline buttons with a notice link', async () => {
    await renderBanner()
    expect(screen.getByTestId('analytics-consent-banner')).toHaveTextContent(
      consentBanner.text,
    )
    const accept = screen.getByRole('button', { name: 'Accept Analytics' })
    const decline = screen.getByRole('button', { name: 'Decline' })
    expect(accept.tagName).toBe(decline.tagName)
    expect(accept.className).toBe(decline.className)
    const link = screen.getByRole('link', { name: 'Privacy notice' })
    expect(link.getAttribute('href')).toBe('/privacy')
  })

  it('hides once the visitor chose', async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'declined')
    await renderBanner()
    expect(
      screen.queryByTestId('analytics-consent-banner'),
    ).not.toBeInTheDocument()
  })

  it('accepting persists the choice and hides the banner', async () => {
    const user = userEvent.setup()
    await renderBanner()
    await user.click(screen.getByRole('button', { name: 'Accept Analytics' }))
    expect(readConsent()).toBe('accepted')
    expect(
      screen.queryByTestId('analytics-consent-banner'),
    ).not.toBeInTheDocument()
  })

  it('declining persists the choice and hides the banner', async () => {
    const user = userEvent.setup()
    await renderBanner()
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    expect(readConsent()).toBe('declined')
    expect(
      screen.queryByTestId('analytics-consent-banner'),
    ).not.toBeInTheDocument()
  })
})
