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

const v1Names = vi.fn()
const v2Names = vi.fn()

type SearchParams = { readonly address: string; readonly search?: string }

// Keyed like the real queries, address included, so the previous search's rows
// are kept while the next one loads.
vi.mock('@/features/dashboard/hooks/useV1NamesForAddress', () => ({
  getV1NamesPagesForAddressQueryOptions: (params: SearchParams) => ({
    queryKey: ['v1-names-search-test', params],
    queryFn: () => v1Names(params.search),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
}))

vi.mock('@/features/dashboard/hooks/useV2NamesWithRolesForAddress', () => ({
  getV2NamesPagesForAddressQueryOptions: (params: SearchParams) => ({
    queryKey: ['v2-names-search-test', params],
    queryFn: () => v2Names(params.search),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
}))

const { Route } = await import('./names')
const NamesRoute = (Route as unknown as { component: () => ReactNode })
  .component

const v1Page = (names: readonly string[]) => ({
  names: names.map((name, i) => {
    const expiry = Date.now() + (300 + i) * MS_PER_DAY
    return {
      name,
      parentName: 'eth',
      expiryDate: { date: new Date(expiry), value: expiry },
      relation: { registrant: true, owner: true, wrappedOwner: false },
    }
  }),
  hasNextPage: false,
})

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
    v1Names.mockReset()
    v1Names.mockResolvedValue(v1Page([]))
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

  it('keeps the old rows up while a search loads, without calling their count the match count', async () => {
    const user = userEvent.setup()
    let finishSearch: (result: ReturnType<typeof page>) => void = () => {}
    const pendingSearch = new Promise<ReturnType<typeof page>>((resolve) => {
      finishSearch = resolve
    })
    v2Names.mockImplementation((search?: string) =>
      search === undefined ? page(['alpha.eth', 'beta.eth']) : pendingSearch,
    )
    renderRoute()
    await screen.findByText('Names (2)', {}, SLOW)

    await user.type(searchBox(), 'coco')
    await waitFor(() => expect(v2Names).toHaveBeenCalledWith('coco'), SLOW)

    expect(screen.getAllByText('alpha.eth').length).toBeGreaterThan(0)
    expect(screen.queryByText(/matching/)).not.toBeInTheDocument()

    finishSearch(page(['coco.eth']))
    expect(
      await screen.findByText('Names (1 matching)', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.queryByText('alpha.eth')).not.toBeInTheDocument()
  })

  it('shows one source’s matches when the other source’s search fails', async () => {
    const user = userEvent.setup()
    v1Names.mockImplementation((search?: string) =>
      v1Page(search === 'coco' ? ['coco-v1.eth'] : []),
    )
    v2Names.mockImplementation((search?: string) =>
      search === undefined
        ? page(['alpha.eth'])
        : Promise.reject(new Error('indexer unavailable')),
    )
    renderRoute()
    await screen.findByText('Names (1)', {}, SLOW)

    await user.type(searchBox(), 'coco')

    expect(
      await screen.findByText(/Error searching ENSv2 names/, {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.getAllByText('coco-v1.eth').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Error searching ENSv1 names/)).toBeNull()
    await waitFor(() => expect(searchBox()).toHaveValue('coco'))
  })
})
