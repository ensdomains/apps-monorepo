import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'

const ADDRESS = '0x55e55c649895940826a852820d9e1a076ec47b09'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ addr: ADDRESS }),
  }),
}))

const pages = vi.fn()

vi.mock(
  '@/features/forward-resolution/components/hooks/useNamesForResolvedAddress',
  () => ({
    getResolvedNamesForAddressQueryOptions: () => ({
      queryKey: ['resolved-names-paging-test'],
      queryFn: ({ pageParam }: { pageParam: number }) => pages(pageParam),
      initialPageParam: 0,
      getNextPageParam: (last: { hasNextPage: boolean }, all: unknown[]) =>
        last.hasNextPage ? all.length : undefined,
    }),
  }),
)

const { Route } = await import('./resolution')
const ResolutionRoute = (Route as unknown as { component: () => ReactNode })
  .component

const page = (index: number, count: number, hasNextPage: boolean) => ({
  names: Array.from({ length: count }, (_, i) => ({
    name: `name-${index}-${i}.eth`,
    coinTypes: ['60'],
  })),
  hasNextPage,
})

const SLOW = { timeout: 10_000 }

// Each row has its own "More" button; the loader's carries a title.
const more = () => screen.getByTitle(/^Show \d+$/)

describe('addr resolution route paging', { timeout: 60_000 }, () => {
  beforeEach(() => {
    pages.mockReset()
  })

  it('loads the next page on More and shows the total once the list ends', async () => {
    const user = userEvent.setup()
    pages.mockImplementation((index: number) =>
      index === 0 ? page(0, 100, true) : page(1, 12, false),
    )
    render(<ResolutionRoute />, { wrapper: createTestWrapper() })

    expect(await screen.findByText('Showing 100', {}, SLOW)).toBeInTheDocument()
    expect(screen.queryByText('name-1-0.eth')).not.toBeInTheDocument()

    await user.click(more())

    expect(
      await screen.findByText('name-1-11.eth', {}, SLOW),
    ).toBeInTheDocument()
    expect(pages).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('keeps the rows shown when the next page fails, and loads it on retry', async () => {
    const user = userEvent.setup()
    pages
      .mockResolvedValueOnce(page(0, 100, true))
      .mockRejectedValueOnce(new Error('subgraph unavailable'))
      .mockResolvedValueOnce(page(1, 12, false))
    render(<ResolutionRoute />, { wrapper: createTestWrapper() })
    await screen.findByText('Showing 100', {}, SLOW)

    await user.click(more())
    expect(await screen.findByRole('alert', {}, SLOW)).toHaveTextContent(
      'Couldn’t load more.',
    )
    expect(screen.getByText('name-0-0.eth')).toBeInTheDocument()

    await user.click(more())
    expect(
      await screen.findByText('name-1-11.eth', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
