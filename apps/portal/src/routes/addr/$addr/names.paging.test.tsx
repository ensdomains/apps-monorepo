import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import { createTestWrapper } from '@/test-utils/providers'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'
const PAGE_SIZE = 100
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

const v1Pages = vi.fn()
const v2Pages = vi.fn()

vi.mock('@/features/dashboard/hooks/useV1NamesForAddress', () => ({
  getV1NamesPagesForAddressQueryOptions: () => ({
    queryKey: ['v1-names-paging-test'],
    queryFn: ({ pageParam }: { pageParam: number }) => v1Pages(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: { hasNextPage: boolean }, pages: unknown[]) =>
      last.hasNextPage ? pages.length : undefined,
  }),
}))

vi.mock('@/features/dashboard/hooks/useV2NamesWithRolesForAddress', () => ({
  getV2NamesPagesForAddressQueryOptions: () => ({
    queryKey: ['v2-names-paging-test'],
    queryFn: ({ pageParam }: { pageParam: number }) => v2Pages(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: { hasNextPage: boolean }, pages: unknown[]) =>
      last.hasNextPage ? pages.length : undefined,
  }),
}))

const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

/** `count` ENSv1 names for page `page`, later pages expiring later. */
const v1Page = (page: number, count: number, hasNextPage: boolean) => ({
  names: Array.from({ length: count }, (_, i) => {
    const expiry = Date.now() + (400 + page * PAGE_SIZE + i) * MS_PER_DAY
    return {
      name: `v1-${page}-${i}.eth`,
      parentName: 'eth',
      expiryDate: { date: new Date(expiry), value: expiry },
      relation: { registrant: true, owner: true, wrappedOwner: false },
    }
  }),
  hasNextPage,
})

const v2Page = (
  page: number,
  count: number,
  totalCount: number,
  hasNextPage: boolean,
) => ({
  names: Array.from({ length: count }, (_, i) => ({
    name: `v2-${page}-${i}.eth`,
    expiryDate: Math.floor(
      (Date.now() + (2000 + page * PAGE_SIZE + i) * MS_PER_DAY) / 1000,
    ),
    roleBitmap: '0x5',
    subdomainCount: 0,
  })),
  totalCount,
  hasNextPage,
})

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
  beforeEach(() => {
    v1Pages.mockReset()
    v2Pages.mockReset()
  })

  it('holds back names a later page could precede, and shows the total once ENSv1 ends', async () => {
    const user = userEvent.setup()
    v1Pages.mockImplementation((page: number) =>
      page === 0 ? v1Page(0, 100, true) : v1Page(1, 20, false),
    )
    v2Pages.mockImplementation((page: number) =>
      page === 0 ? v2Page(0, 100, 150, true) : v2Page(1, 50, 150, false),
    )
    renderRoute()

    // The ENSv2 page expires after ENSv1 names that are not loaded yet.
    expect(await screen.findByText('Showing 100', {}, SLOW)).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent(/Names$/)
    expect(screen.queryByText('v2-0-0.eth')).not.toBeInTheDocument()

    await user.click(more())
    expect(
      await screen.findByText('Showing 200 of 270', {}, SLOW),
    ).toBeInTheDocument()
    expect(v1Pages).toHaveBeenCalledTimes(2)
    expect(v2Pages).toHaveBeenCalledTimes(2)

    await user.click(more())
    expect(await screen.findByText('Names (270)', {}, SLOW)).toBeInTheDocument()
    expect(v1Pages).toHaveBeenCalledTimes(2)
    expect(v2Pages).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('keeps the rows shown when a later page fails, and loads them on retry', async () => {
    const user = userEvent.setup()
    v1Pages.mockResolvedValue(v1Page(0, 10, false))
    v2Pages
      .mockResolvedValueOnce(v2Page(0, 100, 150, true))
      .mockRejectedValueOnce(new Error('indexer unavailable'))
      .mockResolvedValueOnce(v2Page(1, 50, 150, false))
    renderRoute()
    expect(
      await screen.findByText('Showing 100 of 160', {}, SLOW),
    ).toBeInTheDocument()

    await user.click(more())
    expect(await screen.findByRole('alert', {}, SLOW)).toHaveTextContent(
      'Couldn’t load more.',
    )
    expect(screen.getByText('Showing 110 of 160')).toBeInTheDocument()

    await user.click(more())
    expect(await screen.findByText('Names (160)', {}, SLOW)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a ticked name ticked when the rows are reordered', async () => {
    const user = userEvent.setup()
    v1Pages.mockResolvedValue(v1Page(0, 0, false))
    v2Pages.mockImplementation((page: number) =>
      page === 0
        ? v2Page(1, 100, 200, true)
        : // The second page expires sooner, so it sorts above the first.
          v2Page(0, 100, 200, false),
    )
    renderRoute()
    await screen.findByText('Showing 100 of 200', {}, SLOW)

    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0])
    expect(await screen.findByText('1 selected', {}, SLOW)).toBeInTheDocument()
    const ticked = () =>
      screen
        .getAllByRole('row')
        .filter((row) => row.getAttribute('data-state') === 'selected')
        .map((row) => row.textContent ?? '')

    expect(ticked().every((text) => text.includes('v2-1-0.eth'))).toBe(true)

    await user.click(more())
    await screen.findByText('Names (200)', {}, SLOW)

    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(ticked().length).toBeGreaterThan(0)
    expect(ticked().every((text) => text.includes('v2-1-0.eth'))).toBe(true)
  })
})
