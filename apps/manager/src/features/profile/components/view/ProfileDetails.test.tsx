import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { ProfileDetails } from './ProfileDetails'

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

const owner = '0x7F1234567890123456789012345678901234d5Cb' as Address

const renderProfileDetails = async (ownerReverseName?: string) => {
  const rootRoute = createRootRoute({
    component: () => (
      <ProfileDetails owner={owner} ownerReverseName={ownerReverseName} />
    ),
  })
  const addressRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$address',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([addressRoute]),
  })

  await router.load()
  render(<RouterProvider router={router} />)

  return router
}

describe('ProfileDetails', () => {
  beforeEach(() => vi.mocked(copyToClipboard).mockClear())

  it('links the reverse owner name to the address and keeps copying independent', async () => {
    const router = await renderProfileDetails('owner.eth')
    const ownerLink = await screen.findByRole('link', { name: 'owner.eth' })

    expect(ownerLink).toHaveAttribute('href', `/${owner}`)

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(owner))
    expect(router.state.location.pathname).toBe('/')

    fireEvent.click(ownerLink)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/${owner}`),
    )
  })

  it('displays the truncated address when no reverse name is available', async () => {
    await renderProfileDetails()

    expect(
      await screen.findByRole('link', { name: '0x7F12...d5Cb' }),
    ).toHaveAttribute('href', `/${owner}`)
  })
})
