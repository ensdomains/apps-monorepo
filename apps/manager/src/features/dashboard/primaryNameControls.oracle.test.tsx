import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavSection } from '@/features/navigation/Header/account/NavSection'
import { render } from '@/utils/test-utils'
import { NameRow } from './components/NameRow'
import { PrimaryNameCard } from './components/PrimaryNameCard'

// Written before either implementation lane starts. Observe existing rendered
// interfaces, not a proposed shared component, prop, class, or state mechanism.
// Dialog internals and browser hover/focus require the separate journey checks.
type NameQueryParams = { readonly name: string }
const registrationQueryKey = createQueryKey<
  'oracle-registration',
  NameQueryParams
>('oracle-registration')
const expiryQueryKey = createQueryKey<'oracle-expiry', NameQueryParams>(
  'oracle-expiry',
)

const wallet = vi.hoisted(() => ({ reverseName: null as string | null }))

vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({
    data: wallet.reverseName,
    isSuccess: true,
  }),
}))

vi.mock('./components/ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: ({ children }: { readonly children: ReactNode }) =>
    children,
}))

vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: (name: string) => ({
    queryKey: registrationQueryKey({ name }),
    queryFn: async () => ({ registrationDate: 1_700_000_000 }),
  }),
}))

vi.mock('@/features/profile/service/profileExpiry', () => ({
  profileExpiryQuery: (name: string) => ({
    queryKey: expiryQueryKey({ name }),
    queryFn: async () => null,
  }),
  getProfileExpiryResultStatus: () => ({
    isInGrace: false,
    displayExpiryDate: null,
  }),
}))

const renderSurface = async (surface: ReactNode) => {
  const rootRoute = createRootRoute({ component: () => surface })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

describe('WEB-656 blind primary-name control oracle', () => {
  beforeEach(() => {
    wallet.reverseName = null
  })

  afterEach(cleanup)

  it('exposes the configured Dashboard label as a native button', async () => {
    await renderSurface(<PrimaryNameCard primaryName="alaska.eth" />)

    const control = await screen.findByRole('button', {
      name: 'Primary Name',
    })
    expect(control.tagName).toBe('BUTTON')
    expect(control).toHaveAttribute('type', 'button')
    expect(control).toBeEnabled()
    expect(control.closest('a')).toBeNull()
  })

  it('does not make the displayed primary-name value interactive', async () => {
    await renderSurface(<PrimaryNameCard primaryName="alaska.eth" />)

    const value = await screen.findByText('alaska.eth', { exact: true })
    expect(
      value.closest('button, a, [role="button"], [role="link"], [tabindex]'),
    ).toBeNull()
  })

  it('retains the separate profile link in the Dashboard card', async () => {
    await renderSurface(<PrimaryNameCard primaryName="alaska.eth" />)

    const link = await screen.findByRole('link', { name: /go to profile/i })
    expect(link).toHaveAttribute('href', '/alaska.eth')
  })

  it('offers a native enabled chooser action in navigation without a primary name', async () => {
    await renderSurface(
      <NavSection onAction={vi.fn()} onChoosePrimaryName={vi.fn()} />,
    )

    const action = await screen.findByRole('button', {
      name: 'Primary Name Profile',
    })
    expect(action.tagName).toBe('BUTTON')
    expect(action).toHaveAttribute('type', 'button')
    expect(action).toBeEnabled()
    expect(action).not.toHaveAttribute('aria-disabled', 'true')
    expect(action.closest('a')).toBeNull()
    expect(
      screen.queryByRole('link', { name: /Primary Name Profile/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps configured-primary navigation as a correct profile link', async () => {
    wallet.reverseName = 'alaska.eth'
    await renderSurface(
      <NavSection onAction={vi.fn()} onChoosePrimaryName={vi.fn()} />,
    )

    const link = await screen.findByRole('link', {
      name: /Primary Name Profile/,
    })
    expect(link).toHaveAttribute('href', '/alaska.eth')
    expect(link).not.toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.queryByRole('button', { name: /Primary Name Profile/ }),
    ).not.toBeInTheDocument()
  })

  it('does not opt generic NameRow consumers into a chooser action', async () => {
    await renderSurface(
      <NameRow label="alaska.eth" nameRoles={['owner', 'manager']} verified />,
    )

    expect(await screen.findByText('alaska.eth')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Primary Name/ }),
    ).not.toBeInTheDocument()
    for (const label of ['Owner', 'Manager']) {
      expect(screen.getByText(label).closest('button, a')).toBeNull()
    }
  })
})
