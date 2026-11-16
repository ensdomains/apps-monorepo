import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import {
  getResolverOverviewQueryOptions,
  type ResolverOverview,
} from '@/features/resolver/hooks/useResolverOverview'
import { closeTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'

const ADDRESS = '0x1111111111111111111111111111111111111111'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { readonly children: ReactNode }) => (
    <a href="/">{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ address: ADDRESS }),
  }),
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ address: ADDRESS }),
  usePublicClient: () => undefined,
  useWalletClient: () => ({ data: undefined }),
  useChainId: () => 11155111,
  useBalance: () => ({ data: undefined }),
  useEstimateFeesPerGas: () => ({ data: undefined }),
}))

vi.mock('@ens-apps/transaction-manager', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ens-apps/transaction-manager')>()
  const transactions = new Map<string, TransactionMachineActor>()
  return { ...actual, useActiveTransactions: () => transactions }
})

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => null,
}))

const { Route } = await import('./links')
const LinksPage = Route.options.component
if (!LinksPage) throw new Error('Links route must have a component')

const overview = (...names: readonly string[]): ResolverOverview => ({
  address: ADDRESS,
  nodeCount: names.length,
  nodeCountIsLowerBound: false,
  mirrorRegistry: null,
  linkCount: names.length,
  linksStatus: 'full',
  rolesStatus: 'full',
  roleHolderCount: 1,
  links: names.map((name) => ({
    name,
    namehash: `0x${'1'.repeat(64)}`,
    recordId: '1',
    sharedWith: names.filter((other) => other !== name),
  })),
  namedResources: [],
  roles: [],
  events: [],
  eventsHasMore: false,
})

const mountPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  const key = getResolverOverviewQueryOptions({ address: ADDRESS }).queryKey
  client.setQueryData(key, overview('alpha.eth', 'beta.eth'))
  client.setQueryData(
    getHasRolesQueryOptions({
      resolverAddress: ADDRESS,
      roles: ['ROLE_LINK'],
      account: ADDRESS,
    }).queryKey,
    true,
  )
  const commits = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <Profiler
        id="links"
        onRender={() => {
          commits()
          // Stop a regressed table loop before it starves the test runner's timers.
          if (commits.mock.calls.length > 50)
            throw new Error('Links render loop')
        }}
      >
        <LinksPage />
      </Profiler>
    </QueryClientProvider>,
  )
  return { client, key }
}

const table = () => within(screen.getByRole('table'))
const row = (name: string) =>
  table()
    .getAllByRole('row')
    .find((item) => item.querySelector('td')?.textContent?.includes(name))
const bin = (name: string) => {
  const target = row(name)?.querySelector('button:has(.lucide-trash-2)')
  if (!(target instanceof HTMLElement)) throw new Error(`No bin for ${name}`)
  return target
}

afterEach(() => {
  cleanup()
  closeTransactionModal()
  vi.clearAllMocks()
})

describe('resolver links table', () => {
  it('searches and restores rows without a render loop', async () => {
    const user = userEvent.setup()
    mountPage()
    await user.type(screen.getByPlaceholderText('Search...'), 'alpha')
    expect(table().getAllByRole('row')).toHaveLength(2)
    expect(
      table().getAllByRole('row')[1]?.querySelector('td'),
    ).toHaveTextContent('alpha.eth')
    await user.type(screen.getByPlaceholderText('Search...'), 'missing')
    expect(table().getByText('No links match your search.')).toBeInTheDocument()
    await user.clear(screen.getByPlaceholderText('Search...'))
    expect(table().getAllByRole('row')).toHaveLength(3)
  })

  it('opens, cancels and reopens unlink confirmation without submitting', async () => {
    const user = userEvent.setup()
    const { client } = mountPage()
    await user.click(bin('alpha.eth'))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Unlink name')
    await user.click(screen.getByRole('button', { name: /^Close$/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(bin('beta.eth'))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Unlink name')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' }),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('Unlink beta.eth')
    expect(client.getMutationCache().getAll()).toEqual([])
  })

  it('renders refreshed links while preserving the current search', async () => {
    const user = userEvent.setup()
    const { client, key } = mountPage()
    await user.type(screen.getByPlaceholderText('Search...'), 'gamma')
    expect(table().getByText('No links match your search.')).toBeInTheDocument()
    await act(async () =>
      client.setQueryData(key, overview('gamma.eth', 'delta.eth')),
    )
    expect(table().getAllByRole('row')).toHaveLength(2)
    await waitFor(() =>
      expect(
        table().getAllByRole('row')[1]?.querySelector('td'),
      ).toHaveTextContent('gamma.eth'),
    )
    await user.clear(screen.getByPlaceholderText('Search...'))
    expect(table().getAllByRole('row')).toHaveLength(3)
    expect(table().queryByText('alpha.eth')).not.toBeInTheDocument()
    await act(async () => client.setQueryData(key, overview()))
    expect(await screen.findByText('No linked names yet')).toBeInTheDocument()
  })
})
