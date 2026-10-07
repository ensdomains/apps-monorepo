import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RoleHistoryEntry } from '@/features/roles/hooks/useRoleHistory'

vi.mock('@/components/table/EventsDataTable', () => ({
  EventsSidebar: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/table/EventsDataTable/AddressDisplay', () => ({
  AddressDisplay: ({ address }: { address: string }) => <span>{address}</span>,
}))

const history = vi.fn()
vi.mock('@/features/roles/hooks/useRoleHistory', () => ({
  getRoleHistoryQueryOptions: () => ({
    queryKey: ['role-history-table-test'],
    queryFn: () => history(),
  }),
}))

const { RoleHistoryTable } = await import('./RoleHistoryTable')

const REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4'

const entry = (i: number): RoleHistoryEntry => ({
  account: `0x${(i + 1).toString(16).padStart(40, '0')}`,
  resource: '0x0',
  oldRoles: [],
  newRoles: ['ROLE_RENEW'],
  transactionHash: `0x${(i + 1).toString(16).padStart(64, '0')}`,
  timestamp: BigInt(1_790_000_000 + i),
  blockNumber: BigInt(i + 1),
})

const renderTable = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RoleHistoryTable name="example.eth" registryAddress={REGISTRY} />
    </QueryClientProvider>,
  )

// The table renders once for mobile and once for desktop.
const desktopRows = () => screen.getAllByRole('row').length - 1

describe('RoleHistoryTable', () => {
  it('shows every change, without a loader, when they fit', async () => {
    history.mockResolvedValue(Array.from({ length: 3 }, (_, i) => entry(i)))
    renderTable()

    await screen.findAllByText('+ ROLE_RENEW')
    expect(desktopRows()).toBe(3)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('opens at ten changes and reveals the rest on demand', async () => {
    const user = userEvent.setup()
    history.mockResolvedValue(Array.from({ length: 25 }, (_, i) => entry(i)))
    renderTable()

    expect(await screen.findByText('Showing 10 of 25')).toBeInTheDocument()
    expect(desktopRows()).toBe(10)

    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(desktopRows()).toBe(25)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })
})
