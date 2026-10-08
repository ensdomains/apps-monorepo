import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { render, screen, waitFor } from '@testing-library/react'
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

const v2Names = vi.fn()

vi.mock('@/features/dashboard/hooks/useV1NamesForAddress', () => ({
  getV1NamesPagesForAddressQueryOptions: ({ search }: { search?: string }) => ({
    queryKey: ['v1-names-search-test', search ?? null],
    queryFn: () => ({ names: [], hasNextPage: false }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
}))

vi.mock('@/features/dashboard/hooks/useV2NamesWithRolesForAddress', () => ({
  getV2NamesPagesForAddressQueryOptions: ({ search }: { search?: string }) => ({
    queryKey: ['v2-names-search-test', search ?? null],
    queryFn: () => v2Names(search),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
}))

const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

const page = (names: readonly string[]) => ({
  names: names.map((name, i) => ({
    name,
    expiryDate: Math.floor((Date.now() + (400 + i) * MS_PER_DAY) / 1000),
    roleBitmap: '0x5',
    subdomainCount: 0,
  })),
  totalCount: names.length,
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

const SLOW = { timeout: 10_000 }

const searchBox = () => screen.getByPlaceholderText('Search names...')

describe('addr names route search', { timeout: 60_000 }, () => {
  beforeEach(() => {
    v2Names.mockReset()
    v2Names.mockImplementation((search?: string) =>
      search === undefined
        ? page(['alpha.eth', 'beta.eth'])
        : page(search === 'coco' ? ['coco.eth'] : []),
    )
  })

  it('asks the sources for the typed text, so names that were never loaded are found', async () => {
    const user = userEvent.setup()
    renderRoute()
    expect(await screen.findByText('Names (2)', {}, SLOW)).toBeInTheDocument()
    expect(screen.queryByText('coco.eth')).not.toBeInTheDocument()

    await user.type(searchBox(), 'coco')

    expect(
      await screen.findByText('Names (1 matching)', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.getAllByText('coco.eth').length).toBeGreaterThan(0)
    expect(v2Names).toHaveBeenCalledWith('coco')
  })

  it('waits for typing to pause instead of searching on every keystroke', async () => {
    const user = userEvent.setup()
    renderRoute()
    await screen.findByText('Names (2)', {}, SLOW)

    await user.type(searchBox(), 'coco')
    await screen.findByText('Names (1 matching)', {}, SLOW)

    expect(v2Names).not.toHaveBeenCalledWith('c')
    expect(v2Names).not.toHaveBeenCalledWith('coc')
  })

  it('keeps the search box when nothing matches, and restores the list when it is cleared', async () => {
    const user = userEvent.setup()
    renderRoute()
    await screen.findByText('Names (2)', {}, SLOW)

    await user.type(searchBox(), 'zzz')
    expect(
      await screen.findByText('Names (0 matching)', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.queryByText('No names yet')).not.toBeInTheDocument()

    await user.clear(searchBox())
    expect(await screen.findByText('Names (2)', {}, SLOW)).toBeInTheDocument()
    expect(screen.getAllByText('alpha.eth').length).toBeGreaterThan(0)
  })

  it('keeps the search box and says so when a search fails', async () => {
    const user = userEvent.setup()
    v2Names.mockImplementation((search?: string) =>
      search === undefined
        ? page(['alpha.eth'])
        : Promise.reject(new Error('indexer unavailable')),
    )
    renderRoute()
    await screen.findByText('Names (1)', {}, SLOW)

    await user.type(searchBox(), 'coco')

    expect(
      await screen.findByText(/Error searching names/, {}, SLOW),
    ).toBeInTheDocument()
    await waitFor(() => expect(searchBox()).toHaveValue('coco'))
  })
})
