import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { RenewalRouteError } from './RenewalRouteError'

const renderRouteError = async (
  name: string,
  message: string,
  onRetry?: () => void,
) => {
  const rootRoute = createRootRoute({
    component: () => (
      <RenewalRouteError message={message} name={name} onRetry={onRetry} />
    ),
  })
  const nameRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$name',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([nameRoute]),
  })

  await router.load()
  render(<RouterProvider router={router} />)
}

describe('RenewalRouteError', () => {
  it('shows only the profile link for a refused renewal', async () => {
    await renderRouteError('sub.alice.eth', 'Subnames are not supported')

    expect(screen.getByText('Subnames are not supported')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Back to profile' }),
    ).toHaveAttribute('href', '/sub.alice.eth')
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the retry action when the route failed', async () => {
    const onRetry = vi.fn()
    await renderRouteError('alice.eth', 'fetch failed', onRetry)

    expect(
      await screen.findByRole('link', { name: 'Back to profile' }),
    ).toHaveAttribute('href', '/alice.eth')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
