import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RecentActivityEvent } from '../hooks/useRecentActivity'
import { RecentActivityTable } from './RecentActivityTable'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
  }) => (
    <a
      href={to}
      data-to={to}
      data-params={JSON.stringify(params)}
      data-testid="router-link"
    >
      {children}
    </a>
  ),
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => <span data-testid="avatar" />,
}))

vi.mock('@/hooks/useSupportsInterfaces', () => ({
  getSupportsInterfacesQueryOptions: () => ({
    queryKey: ['supports-interfaces-mock'],
    queryFn: async () => [false],
  }),
}))

vi.mock('@/utils/blockExplorer/useBlockExplorerUrl', () => ({
  useBlockExplorerTxUrl: (txHash: string) =>
    `https://etherscan.io/tx/${txHash}`,
}))

const eventsRef = vi.hoisted(() => ({
  current: [] as readonly RecentActivityEvent[],
}))

vi.mock('../hooks/useRecentActivity', () => ({
  getRecentActivityQueryOptions: () => ({
    queryKey: ['recent-activity-mock'],
    queryFn: async () => ({
      events: eventsRef.current,
      endCursor: null,
      hasNextPage: false,
    }),
    initialPageParam: undefined,
    getNextPageParam: () => undefined,
  }),
}))

const nameChangedEvent = (
  reverseName: string,
  indexedName: string | null = null,
): RecentActivityEvent => ({
  name: indexedName,
  type: 'NameChanged',
  transactionHash: '0x01',
  timestamp: Math.floor(Date.now() / 1000),
  blockNumber: 0,
  contractAddress: '0x02',
  namehash: null,
  domain: null,
  data: JSON.stringify({ name: reverseName }),
})

const renderTable = async (events: readonly RecentActivityEvent[]) => {
  eventsRef.current = events
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RecentActivityTable />
    </QueryClientProvider>,
  )
  await screen.findByText('Primary name updated')
}

/** The distinct names the row links to — `/$name` is rendered by both the pill and its chip. */
const linkedNames = () =>
  new Set(
    screen
      .queryAllByTestId('router-link')
      .filter((link) => link.dataset.to === '/$name')
      .map((link) => JSON.parse(link.dataset.params ?? '{}').name),
  )

describe('RecentActivityTable', () => {
  it('renders a reverse-record name as an unlinked pill, not a name badge', async () => {
    await renderTable([nameChangedEvent('vitalik.eth')])

    expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
    expect(linkedNames()).toEqual(new Set())
  })

  it('still links the indexed name of the node the event belongs to', async () => {
    await renderTable([nameChangedEvent('vitalik.eth', 'alice.eth')])

    expect(linkedNames()).toEqual(new Set(['alice.eth']))
  })
})
