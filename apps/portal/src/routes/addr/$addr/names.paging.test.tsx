import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import { createTestWrapper } from '@/test-utils/providers'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'
const MS_PER_DAY = 24 * 60 * 60 * 1000

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDRESS }),
  }),
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: ({ name }: { name: string }) => <span data-name={name} />,
}))

const names = vi.fn()

vi.mock('@/features/dashboard/hooks/useAddressNames', () => ({
  getAddressNamesQueryKey: (params: unknown) => [
    'address-names-paging-test',
    params,
  ],
  getAddressNamesQueryOptions: (params: unknown) => ({
    queryKey: ['address-names-paging-test', params],
    queryFn: () => names(),
  }),
}))

const NO_ROLES = new Map()
vi.mock(
  '@/features/dashboard/hooks/useAddressRoleCounts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/dashboard/hooks/useAddressRoleCounts')
    >()),
    getAddressRolesQueryOptions: (params: unknown) => ({
      queryKey: ['paging-roles', params],
      queryFn: () => NO_ROLES,
      initialData: NO_ROLES,
      staleTime: Infinity,
    }),
  }),
)

// Pricing and ownership requests are covered by the renewal modal tests.
// These tests exercise the table and must not start those unrelated requests.
vi.mock('@/features/renew/components/ExtendNameModal', () => ({
  ExtendNameModal: () => null,
}))
vi.mock(
  '@/features/renew/components/multi-name-extension/MultiNameExtendModal',
  () => ({ MultiNameExtendModal: () => null }),
)

const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

/** `count` names, soonest expiry first, as the read returns them. */
const nameRows = (count: number, prefix = 'name') =>
  Array.from({ length: count }, (_, i) => ({
    name: `${prefix}-${i}.eth`,
    expiryDate: new Date(Date.now() + (400 + i) * MS_PER_DAY),
    graceEndDate: new Date(Date.now() + (490 + i) * MS_PER_DAY),
    status: 'active',
    relations: ['owner'],
    protocolVersion: 'ENSv2',
  }))

const TransactionManagerScope = ({ children }: { children: ReactNode }) => {
  const publicClient = usePublicClient()
  if (!publicClient) return <>{children}</>
  return (
    <TransactionManagerProvider publicClient={publicClient}>
      {children}
    </TransactionManagerProvider>
  )
}

const renderRoute = () => {
  const TestProviders = createTestWrapper()
  return render(<NamesRoute />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TestProviders>
        <TransactionManagerScope>{children}</TransactionManagerScope>
      </TestProviders>
    ),
  })
}

// Each step renders hundreds of table rows.
const SLOW = { timeout: 10_000 }

const more = () => screen.getByRole('button', { name: 'More' })

describe('addr names route paging', { timeout: 60_000 }, () => {
  beforeEach(() => names.mockReset())

  it('shows the first hundred names, then the rest on More', async () => {
    const user = userEvent.setup()
    names.mockResolvedValue(nameRows(150))
    renderRoute()

    expect(
      await screen.findByText('Showing 100 of 150', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Names (150)')

    await user.click(more())
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
    expect(screen.getAllByText('name-149.eth').length).toBeGreaterThan(0)
  })

  it('searches every name, not just the rows shown', async () => {
    const user = userEvent.setup()
    names.mockResolvedValue([...nameRows(150), ...nameRows(1, 'deep')])
    renderRoute()
    await screen.findByText('Showing 100 of 151', {}, SLOW)

    await user.type(screen.getByPlaceholderText('Search names...'), 'deep')

    expect(
      await screen.findByText('Names (1 matching)', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.getAllByText('deep-0.eth').length).toBeGreaterThan(0)
  })

  it('filters across names beyond the initial window and counts facets over all loaded names', async () => {
    const user = userEvent.setup()
    names.mockResolvedValue([
      ...nameRows(150),
      { ...nameRows(1)[0], name: 'sub.parent.eth' },
    ])
    renderRoute()
    await screen.findByText('Showing 100 of 151', {}, SLOW)
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByText('Level', { selector: 'summary' }))
    const subnames = screen.getByLabelText('Subnames (3LD+)')
    expect(subnames).toHaveAccessibleDescription('1 matching names')
    await user.click(subnames)
    expect(
      await screen.findByText('Names (1 of 151 matching)', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.getAllByText('sub.parent.eth')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'More' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close filters' }))
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(
      await screen.findByText('Showing 100 of 151', {}, SLOW),
    ).toBeInTheDocument()
  })

  it('sorts every loaded name before choosing the first hundred', async () => {
    const user = userEvent.setup()
    names.mockResolvedValue([
      ...nameRows(150),
      {
        ...nameRows(1)[0],
        name: 'last.eth',
        expiryDate: new Date(Date.now() + MS_PER_DAY),
      },
    ])
    renderRoute()
    await screen.findByText('Showing 100 of 151', {}, SLOW)
    expect(screen.queryByText('last.eth')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expiry' }))
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('last.eth')
    expect(screen.getAllByText('last.eth')).toHaveLength(2)
  })

  it('keeps selection on visible rows as More expands the window and sorting moves them', async () => {
    const user = userEvent.setup()
    names.mockResolvedValue(nameRows(150))
    renderRoute()
    await screen.findByText('Showing 100 of 150', {}, SLOW)
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(
      await screen.findByText('100 selected', {}, SLOW),
    ).toBeInTheDocument()
    await user.click(more())
    expect(screen.getByText('100 selected')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Select all' }),
    ).toHaveAttribute('aria-checked', 'mixed')
    await user.click(screen.getByRole('button', { name: 'Name' }))
    expect(screen.getByText('100 selected')).toBeInTheDocument()
    // Newly shown names remain unselected even after sorting moves their rows.
    const lastRow = screen
      .getAllByText('name-149.eth')
      .map((node) => node.closest('tr'))
      .find(Boolean)
    expect(lastRow).not.toHaveAttribute('data-state', 'selected')
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(
      await screen.findByText('150 selected', {}, SLOW),
    ).toBeInTheDocument()
  })
})
