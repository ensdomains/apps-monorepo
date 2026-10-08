import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'

const RESOLVER = '0x0c9f5e9ae61165140b49919f0df13c0a6642e80d'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ address: RESOLVER }),
  }),
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => null,
}))

vi.mock('@/features/resolver/components/NodeDetailSheet', () => ({
  NodeDetailSheet: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/resolver/hooks/useResolverOverview', () => ({
  getResolverOverviewQueryOptions: () => ({
    queryKey: ['resolver-overview-nodes-test'],
    queryFn: () => ({ roles: [] }),
  }),
}))

const pages = vi.fn()

vi.mock('@/features/resolver/hooks/useResolverNodes', () => ({
  getResolverNodesQueryOptions: () => ({
    queryKey: ['resolver-nodes-paging-test'],
    queryFn: ({ pageParam }: { pageParam: number }) => pages(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: { hasNextPage: boolean }, all: unknown[]) =>
      last.hasNextPage ? all.length : undefined,
  }),
}))

const { Route } = await import('./nodes')
const NodesRoute = (Route as unknown as { component: () => ReactNode })
  .component

const page = (
  index: number,
  count: number,
  totalCount: number,
  hasNextPage: boolean,
) => ({
  nodes: Array.from({ length: count }, (_, i) => ({
    id: `id-${index}-${i}`,
    name: `node-${index}-${i}.eth`,
    owner: null,
    resolver: { id: 'r', address: RESOLVER },
  })),
  totalCount,
  hasNextPage,
})

const SLOW = { timeout: 10_000 }

// Each row has its own "More" button; the loader's carries a title.
const more = () => screen.getByTitle(/^Show \d+$/)

describe('resolver nodes route paging', { timeout: 60_000 }, () => {
  beforeEach(() => {
    pages.mockReset()
  })

  it('shows the indexer’s total and loads the next page on More', async () => {
    const user = userEvent.setup()
    pages.mockImplementation((index: number) =>
      index === 0 ? page(0, 100, 130, true) : page(1, 30, 130, false),
    )
    render(<NodesRoute />, { wrapper: createTestWrapper() })

    expect(
      await screen.findByText('Showing 100 of 130', {}, SLOW),
    ).toBeInTheDocument()

    await user.click(more())

    expect(
      (await screen.findAllByText('node-1-29.eth', {}, SLOW)).length,
    ).toBeGreaterThan(0)
    expect(pages).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('keeps the rows shown when the next page fails, and loads it on retry', async () => {
    const user = userEvent.setup()
    pages
      .mockResolvedValueOnce(page(0, 100, 130, true))
      .mockRejectedValueOnce(new Error('indexer unavailable'))
      .mockResolvedValueOnce(page(1, 30, 130, false))
    render(<NodesRoute />, { wrapper: createTestWrapper() })
    await screen.findByText('Showing 100 of 130', {}, SLOW)

    await user.click(more())
    expect(await screen.findByRole('alert', {}, SLOW)).toHaveTextContent(
      'Couldn’t load more.',
    )
    expect(screen.getAllByText('node-0-0.eth').length).toBeGreaterThan(0)

    await user.click(more())
    expect(
      (await screen.findAllByText('node-1-29.eth', {}, SLOW)).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
