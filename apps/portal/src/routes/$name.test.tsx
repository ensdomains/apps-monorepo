import { render, screen } from '@testing-library/react'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient, createTestWrapper } from '@/test-utils'

let routeName = 'alice.eth'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
    }: {
      children: React.ReactNode
      to: string
      params?: { name?: string }
    }) => <a href={to.replace('$name', params?.name ?? '')}>{children}</a>,
    Outlet: () => <div data-testid="outlet" />,
    useParams: () => ({ name: routeName }),
  }
})

vi.mock('@/components/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('@/components/ProfileSidebar', () => ({
  ProfileSidebar: () => null,
}))
vi.mock('@/hooks/useRememberName', () => ({ useRememberName: () => null }))

// Tests seed the answer, so nothing refetches over it.
vi.mock('@/features/profile/hooks/useNameAvailability', () => ({
  getNameAvailabilityQueryOptions: (params: { name: string }) => ({
    queryKey: ['check-name-availability', params],
    queryFn: () => Promise.resolve({ isAvailable: false, name: params.name }),
    staleTime: Number.POSITIVE_INFINITY,
  }),
}))

// WEB-2022: a spelling that is not a valid ENS name must say so plainly and
// must not open the name's pages, because every read and write there would
// act on a different, separately-owned token.
const { Route } = await import('./$name')
const NameLayout = Route.options.component
assert(NameLayout)

const renderLayout = () =>
  render(<NameLayout />, { wrapper: createTestWrapper() })

describe('name layout — invalid names', () => {
  afterEach(() => {
    routeName = 'alice.eth'
  })

  it.each(['Swan.eth', 'alice..eth'])(
    'replaces the pages of %s with a warning that the name is invalid',
    (name) => {
      routeName = name

      renderLayout()

      expect(
        screen.getByRole('heading', { name: 'This name is not valid in ENS' }),
      ).toBeInTheDocument()
      expect(screen.getByText(/will not resolve anywhere/)).toBeInTheDocument()
      expect(screen.queryByTestId('outlet')).toBeNull()
    },
  )

  it('links to the spelling the name normalises to', () => {
    routeName = 'Swan.eth'

    renderLayout()

    expect(screen.getByRole('link', { name: 'swan.eth' })).toHaveAttribute(
      'href',
      '/swan.eth',
    )
  })

  it('offers no suggestion when the name cannot be normalized at all', () => {
    routeName = 'alice..eth'

    renderLayout()

    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders the pages when the spelling is already normalized', () => {
    renderLayout()

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'This name is not valid in ENS' }),
    ).toBeNull()
  })
})

describe('name layout — address-like names', () => {
  const name = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth'

  afterEach(() => {
    routeName = 'alice.eth'
  })

  // A free one gets the page's refusal to register it instead.
  it.each([
    { isAvailable: false, hasWarning: true },
    { isAvailable: true, hasWarning: false },
  ])(
    'warns above the pages unless the name is free (free: $isAvailable)',
    ({ isAvailable, hasWarning }) => {
      routeName = name
      const queryClient = createTestQueryClient()
      queryClient.setQueryData(['check-name-availability', { name }], {
        isAvailable,
        name,
      })

      render(<NameLayout />, { wrapper: createTestWrapper(queryClient) })

      expect(
        screen.queryByText(/This name may resolve to another address/) !== null,
      ).toBe(hasWarning)
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    },
  )

  it('warns on a subname, which has no availability to check', () => {
    routeName = `0xd8da6bf26964af9d7eed9e03e53415d37aa96045.base.eth`

    renderLayout()

    expect(
      screen.getByText(/This name may resolve to another address/),
    ).toBeInTheDocument()
  })

  it('does not warn on an ordinary name', () => {
    renderLayout()

    expect(
      screen.queryByText(/This name may resolve to another address/),
    ).toBeNull()
  })
})
