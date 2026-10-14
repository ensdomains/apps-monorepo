import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  RenewableNameError,
  RenewalNotAllowedError,
} from '@/features/renew/utils/renewableName'
import { render } from '@/utils/test-utils'
import { RenewalRouteError } from './RenewalRouteError'

const renderRouteError = async (name: string, error: unknown) => {
  const reset = vi.fn()
  const rootRoute = createRootRoute({
    component: () => (
      <RenewalRouteError error={error} name={name} reset={reset} />
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

  return reset
}

describe('RenewalRouteError', () => {
  it('shows only the profile link when the name itself is refused', async () => {
    await renderRouteError(
      'sub.alice.eth',
      new RenewableNameError({ reason: 'SUBNAMES_NOT_SUPPORTED' }),
    )

    expect(screen.getByText('Subnames are not supported')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Back to profile' }),
    ).toHaveAttribute('href', '/sub.alice.eth')
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('shows only the profile link when the route refused the renewal', async () => {
    await renderRouteError(
      'alice.eth',
      new RenewalNotAllowedError({
        message: 'This name is outside its renewal window.',
      }),
    )

    expect(
      screen.getByText('This name is outside its renewal window.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Back to profile' }),
    ).toHaveAttribute('href', '/alice.eth')
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the retry action for a transient failure', async () => {
    const reset = await renderRouteError('alice.eth', new Error('fetch failed'))

    expect(
      await screen.findByRole('link', { name: 'Back to profile' }),
    ).toHaveAttribute('href', '/alice.eth')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
