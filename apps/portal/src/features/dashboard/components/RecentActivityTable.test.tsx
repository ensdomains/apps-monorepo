import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  // A second page that fails to load.
  hasFailingPage: false,
}))

vi.mock('../hooks/useRecentActivity', () => ({
  getRecentActivityQueryOptions: () => ({
    queryKey: ['recent-activity-mock'],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (pageParam) throw new Error('bigname unavailable')
      return {
        events: eventsRef.current,
        endCursor: eventsRef.hasFailingPage ? 'next' : null,
        hasNextPage: eventsRef.hasFailingPage,
      }
    },
    initialPageParam: undefined,
    getNextPageParam: (last: { endCursor: string | null }) =>
      last.endCursor ?? undefined,
  }),
}))

const nameChangedEvent = (
  reverseName: string,
  indexedName: string | null = null,
): RecentActivityEvent => ({
  name: indexedName,
  type: 'record',
  kind: 'RecordChanged',
  transactionHash: '0x01',
  timestamp: Math.floor(Date.now() / 1000),
  blockNumber: 0,
  contractAddress: '0x02',
  data: { key: 'name', value: reverseName },
})

afterEach(() => {
  eventsRef.hasFailingPage = false
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

  it('keeps the events shown when the next page fails', async () => {
    eventsRef.hasFailingPage = true
    await renderTable([nameChangedEvent('vitalik.eth', 'alice.eth')])

    await userEvent.click(
      screen.getByRole('button', { name: 'Load more events' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load more events.',
    )
    expect(linkedNames()).toEqual(new Set(['alice.eth']))
  })
})
