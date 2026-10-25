import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import type { RegistryRole } from '@/lib/roles/registryPowerRoles'
import { createTestWrapper, renderWithCommitCounter } from '@/test-utils'
import type { AddressNameItem } from '@/utils/names/addressNames'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'
const MS_PER_DAY = 24 * 60 * 60 * 1000

// A registered v1 name and a registered v2 name, v1 names that expired 30,
// 100 and 200 days ago, and v2 names that expired 10 and 60 days ago. The
// v1 name from 100 days ago sits 10 days past the 90-day grace, inside the
// 21-day cooldown; the v2 name from 60 days ago is past both its 28-day
// grace and the cooldown window. Expiries stay relative to now because the
// status rule moves with it.
const V1_REGISTERED = 'v1registered.eth'
const V1_GRACE = 'v1grace.eth'
const V1_PREMIUM = 'v1premium.eth'
const V1_EXPIRED = 'v1expired.eth'
const V2_REGISTERED = 'v2registered.eth'
const V2_GRACE = 'v2grace.eth'
const V2_EXPIRED = 'v2expired.eth'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDRESS }),
  }),
}))

// One `useEnsAvatar` per row; the avatars say nothing about the filter and
// their in-flight resolution would add re-renders of its own.
vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: ({ name }: { name: string }) => <span data-name={name} />,
}))

// Status and grace end as bigname serves them.
const row = (
  name: string,
  expiryMs: number,
  protocolVersion: AddressNameItem['protocolVersion'],
): AddressNameItem => ({
  name,
  expiryDate: new Date(expiryMs),
  graceEndDate: new Date(
    expiryMs + (protocolVersion === 'ENSv1' ? 90 : 28) * MS_PER_DAY,
  ),
  status: expiryMs < Date.now() ? 'expired' : 'active',
  relations: ['owner'],
  protocolVersion,
})

const NAMES: AddressNameItem[] = [
  row(V1_REGISTERED, Date.now() + 365 * MS_PER_DAY, 'ENSv1'),
  row(V1_GRACE, Date.now() - 30 * MS_PER_DAY, 'ENSv1'),
  row(V1_PREMIUM, Date.now() - 100 * MS_PER_DAY, 'ENSv1'),
  row(V1_EXPIRED, Date.now() - 200 * MS_PER_DAY, 'ENSv1'),
  row(V2_REGISTERED, Date.now() + 730 * MS_PER_DAY, 'ENSv2'),
  row(V2_GRACE, Date.now() - 10 * MS_PER_DAY, 'ENSv2'),
  row(V2_EXPIRED, Date.now() - 60 * MS_PER_DAY, 'ENSv2'),
]

const ADDRESS_ROLES: ReadonlyMap<string, readonly RegistryRole[]> = new Map()

// Cached and fresh, so the route renders the names without a request.
vi.mock('@/features/dashboard/hooks/useAddressNames', () => ({
  getAddressNamesQueryKey: (params: unknown) => ['get-address-names', params],
  getAddressNamesQueryOptions: (params: unknown) => ({
    queryKey: ['get-address-names', params],
    queryFn: () => NAMES,
    initialData: NAMES,
    staleTime: Number.POSITIVE_INFINITY,
  }),
}))

vi.mock(
  '@/features/dashboard/hooks/useAddressRoleCounts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/dashboard/hooks/useAddressRoleCounts')
    >()),
    getAddressRolesQueryOptions: (params: unknown) => ({
      queryKey: ['get-address-roles', params],
      queryFn: () => ADDRESS_ROLES,
      initialData: ADDRESS_ROLES,
      staleTime: Number.POSITIVE_INFINITY,
    }),
  }),
)

// The renewal reads the selection triggers say nothing about the filter.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueries: ({ queries }: { queries: readonly unknown[] }) =>
      queries.map(() => ({ data: undefined, isLoading: false, error: null })),
  }
})

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// that object and `Route.component` is the page. See ../../$name/fuses tests.
const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

/** Mirrors `__root.tsx`: the route reads the transaction manager's context. */
const TransactionManagerScope = ({ children }: { children: ReactNode }) => {
  const publicClient = usePublicClient()
  if (!publicClient) return <>{children}</>
  return (
    <TransactionManagerProvider publicClient={publicClient}>
      {children}
    </TransactionManagerProvider>
  )
}

/** The provider tree is built per call so each test gets a fresh QueryClient. */
const renderRoute = () => {
  const TestProviders = createTestWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders>
      <TransactionManagerScope>{children}</TransactionManagerScope>
    </TestProviders>
  )

  return renderWithCommitCounter(() => <NamesRoute />, { wrapper })
}

const openStatusFilter = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Filters/ }))
  await user.click(screen.getByText('Status', { selector: 'summary' }))
}

const shownNames = () =>
  screen
    .getAllByText(/\.eth$/)
    .map((element) => element.textContent)
    .filter((text, index, all) => text !== null && all.indexOf(text) === index)

describe('addr names route status filter', () => {
  it('offers Price cooldown in the Expired group and nowhere says Temporary premium', async () => {
    const user = userEvent.setup()
    renderRoute()

    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
    await openStatusFilter(user)

    const menu = screen
      .getByText('Status', { selector: 'summary' })
      .closest('details')
    expect(menu).not.toBeNull()
    const menuText = menu?.textContent ?? ''
    expect(menuText).toContain('Price cooldown')
    expect(menuText).not.toContain('Temporary premium')
    expect(
      menuText.indexOf('Expired') < menuText.indexOf('Grace') &&
        menuText.indexOf('Grace') < menuText.indexOf('Price cooldown'),
    ).toBe(true)

    expect(screen.getByText('Registered')).toBeInTheDocument()
    expect(screen.getByText('Expires with parent')).toBeInTheDocument()
    expect(screen.getByText('Does not expire')).toBeInTheDocument()
  })

  it('narrows the list to the cooldown names when Price cooldown is chosen', async () => {
    const user = userEvent.setup()
    renderRoute()

    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
    await openStatusFilter(user)

    await user.click(screen.getByText('Price cooldown', { selector: 'label' }))
    expect(await screen.findByText('Names (1 of 7 shown)')).toBeInTheDocument()
    expect(shownNames()).toEqual([V1_PREMIUM])

    await user.click(screen.getByText('Price cooldown', { selector: 'label' }))
    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
    expect(shownNames()).toHaveLength(7)

    await user.click(screen.getByText('Expired', { selector: 'label' }))
    expect(await screen.findByText('Names (2 of 7 shown)')).toBeInTheDocument()
    expect(shownNames()).toEqual(
      expect.arrayContaining([V1_EXPIRED, V2_EXPIRED]),
    )
    expect(shownNames()).toHaveLength(2)

    await user.click(screen.getByText('Expired', { selector: 'label' }))
    expect(await screen.findByText('Names (7)')).toBeInTheDocument()
  })
})
