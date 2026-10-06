import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const feedRef = vi.hoisted(() => ({
  totalCount: undefined as number | undefined,
}))

vi.mock('../hooks/useRecentActivity', () => ({
  RECENT_ACTIVITY_PAGE_SIZE: 15,
  getRecentActivityQueryOptions: () => ({
    queryKey: ['recent-activity-mock'],
    queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
      const total = feedRef.totalCount ?? eventsRef.current.length
      const events = eventsRef.current.slice(pageParam, pageParam + 15)
      return {
        events,
        totalCount: feedRef.totalCount,
        endCursor: null,
        hasNextPage: pageParam + events.length < total,
        next: pageParam + events.length,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (last: { hasNextPage: boolean; next: number }) =>
      last.hasNextPage ? last.next : undefined,
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
  await screen.findAllByText('Primary name updated')
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
  afterEach(() => {
    feedRef.totalCount = undefined
  })

  it('renders a reverse-record name as an unlinked pill, not a name badge', async () => {
    await renderTable([nameChangedEvent('vitalik.eth')])

    expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
    expect(linkedNames()).toEqual(new Set())
  })

  it('still links the indexed name of the node the event belongs to', async () => {
    await renderTable([nameChangedEvent('vitalik.eth', 'alice.eth')])

    expect(linkedNames()).toEqual(new Set(['alice.eth']))
  })

  it('opens with 15 events and loads more on demand, with no All', async () => {
    feedRef.totalCount = 32364
    await renderTable(
      Array.from({ length: 40 }, (_, i) => ({
        ...nameChangedEvent(`name${i}.eth`),
        transactionHash: `0x${(i + 1).toString(16)}` as const,
      })),
    )

    expect(screen.getByText('Showing 15 of 32364')).toBeInTheDocument()
    expect(screen.getAllByText('Primary name updated')).toHaveLength(15)
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'More' }))

    expect(await screen.findByText('Showing 30 of 32364')).toBeInTheDocument()
    expect(screen.getAllByText('Primary name updated')).toHaveLength(30)
  })
})
