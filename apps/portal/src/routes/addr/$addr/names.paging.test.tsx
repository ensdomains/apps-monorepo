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

const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

/** `count` names, soonest expiry first, as the read returns them. */
const nameRows = (count: number, prefix = 'name') =>
  Array.from({ length: count }, (_, i) => ({
    name: `${prefix}-${i}.eth`,
    expiryDate: new Date(Date.now() + (400 + i) * MS_PER_DAY),
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
})
