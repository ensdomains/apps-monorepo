import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}))

const pages = vi.fn()
vi.mock('../hooks/useRegistryReferencedBy', () => ({
  getRegistryReferencedByQueryOptions: () => ({
    queryKey: ['registry-referenced-by-test'],
    queryFn: ({ pageParam }: { pageParam: number }) => pages(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: { hasNextPage: boolean }, all: unknown[]) =>
      last.hasNextPage ? all.length : undefined,
  }),
}))

const { ReferencedByCell } = await import('./ReferencedByCell')

const REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4'

const page = (
  names: readonly (string | null)[],
  totalCount: number,
  hasNextPage = false,
) => ({ names, totalCount, hasNextPage })

const renderCell = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReferencedByCell address={REGISTRY} />
    </QueryClientProvider>,
  )

describe('ReferencedByCell', () => {
  beforeEach(() => {
    pages.mockReset()
  })

  it('lists every reference, without a loader, when they fit', async () => {
    pages.mockResolvedValue(page(['eth', 'ana.eth'], 2))
    renderCell()

    expect(await screen.findByText('ana.eth')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('shows unnamed references as their own entries', async () => {
    pages.mockResolvedValue(page([null, 'eth'], 2))
    renderCell()

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Unnamed')).toBeInTheDocument()
    expect(within(items[1]).getByText('eth')).toBeInTheDocument()
  })

  it('does not look empty when every reference is unnamed', async () => {
    pages.mockResolvedValue(page([null, null], 2))
    renderCell()

    expect(await screen.findAllByText('Unnamed')).toHaveLength(2)
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('shows a dash when nothing references the registry', async () => {
    pages.mockResolvedValue(page([], 0))
    renderCell()

    expect(await screen.findByText('—')).toBeInTheDocument()
  })

  it('says so when the first page fails', async () => {
    pages.mockRejectedValue(new Error('indexer unavailable'))
    renderCell()

    expect(await screen.findByText('Failed to load')).toBeInTheDocument()
  })

  it('opens at ten of the total and reveals more on demand', async () => {
    const user = userEvent.setup()
    pages.mockResolvedValue(
      page(
        Array.from({ length: 25 }, (_, i) => `name${i}.eth`),
        25,
      ),
    )
    renderCell()

    expect(await screen.findByText('Showing 10 of 25')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(await screen.findByText('Showing 20 of 25')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
  })
})
