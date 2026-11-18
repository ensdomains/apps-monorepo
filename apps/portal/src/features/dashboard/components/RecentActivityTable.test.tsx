import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
  nextPage: null as readonly RecentActivityEvent[] | null,
}))

vi.mock('../hooks/useRecentActivity', () => ({
  getRecentActivityQueryOptions: () => ({
    queryKey: ['recent-activity-mock'],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (pageParam && eventsRef.nextPage)
        return {
          events: eventsRef.nextPage,
          endCursor: null,
          hasNextPage: false,
        }
      if (pageParam) throw new Error('bigname unavailable')
      const hasNextPage = eventsRef.hasFailingPage || !!eventsRef.nextPage
      return {
        events: eventsRef.current,
        endCursor: hasNextPage ? 'next' : null,
        hasNextPage,
      }
    },
    initialPageParam: undefined,
    getNextPageParam: (last: { endCursor: string | null }) =>
      last.endCursor ?? undefined,
  }),
}))

const primaryNameEvent = (
  reverseName: string,
  indexedName: string | null = null,
): RecentActivityEvent => ({
  name: indexedName,
  type: 'primary_name',
  kind: 'ReverseChanged',
  transactionHash: '0x01',
  timestamp: Math.floor(Date.now() / 1000),
  blockNumber: 0,
  contractAddress: '0x02',
  data: { name: reverseName, name_status: 'set' },
})

afterEach(() => {
  eventsRef.hasFailingPage = false
  eventsRef.nextPage = null
})

const renderRows = (events: readonly RecentActivityEvent[]) => {
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
}

const renderTable = async (events: readonly RecentActivityEvent[]) => {
  renderRows(events)
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
  it('renders a claimed primary name as an unlinked pill, not a name badge', async () => {
    await renderTable([primaryNameEvent('vitalik.eth')])

    expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
    expect(linkedNames()).toEqual(new Set())
  })

  it('still links the indexed name of the node the event belongs to', async () => {
    await renderTable([primaryNameEvent('vitalik.eth', 'alice.eth')])

    expect(linkedNames()).toEqual(new Set(['alice.eth']))
  })

  it('offers older events when the newest page shows none', async () => {
    eventsRef.hasFailingPage = true
    renderRows([])

    expect(
      await screen.findByRole('button', { name: 'Load more events' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('No recent activity')).not.toBeInTheDocument()
  })

  it('says there is no activity when nothing is left to read', async () => {
    renderRows([])

    expect(await screen.findByText('No recent activity')).toBeInTheDocument()
  })

  it('keeps the events shown when the next page fails', async () => {
    eventsRef.hasFailingPage = true
    await renderTable([primaryNameEvent('vitalik.eth', 'alice.eth')])

    await userEvent.click(
      screen.getByRole('button', { name: 'Load more events' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load more events.',
    )
    expect(linkedNames()).toEqual(new Set(['alice.eth']))
  })

  it('shows a renewal repeated across pages once', async () => {
    const renewal: RecentActivityEvent = {
      ...primaryNameEvent('vitalik.eth', 'alice.eth'),
      type: 'renewal',
      kind: undefined,
      data: {},
    }
    eventsRef.nextPage = [renewal]
    await renderTable([primaryNameEvent('vitalik.eth'), renewal])

    await userEvent.click(
      screen.getByRole('button', { name: 'Load more events' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Load more events' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getAllByText('Name renewed')).toHaveLength(1)
  })
})
