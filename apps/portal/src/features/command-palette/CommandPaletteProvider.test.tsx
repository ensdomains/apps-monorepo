import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo } from 'react'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import {
  ConnectModalProvider,
  useConnectModal,
} from '@/features/wallet/ConnectModalProvider'
import { CommandPaletteProvider } from './CommandPaletteProvider'
import { useCommandPalette } from './context'
import { cancelPaletteHandoff, paletteHandoff } from './handoff'
import { usePageCommands } from './usePageCommands'

type WalletSnapshot = {
  readonly isConnected: boolean
  readonly address?: `0x${string}`
}

const io = vi.hoisted(() => {
  vi.stubEnv('VITE_DQA', '')
  vi.stubEnv('VITE_TIME_TRAVEL', '')
  vi.stubEnv('VITE_MIGRATION_TOOL', '')
  return {
    wallet: { isConnected: false } as WalletSnapshot,
    listeners: new Set<() => void>(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchChain: vi.fn(),
    owner: vi.fn(),
    availability: vi.fn(),
    profile: vi.fn(),
    ethAddress: vi.fn(),
    portfolio: vi.fn(),
    interfaces: vi.fn(),
    dns: vi.fn(),
    avatar: vi.fn(),
    resolver: vi.fn(),
    primaryName: vi.fn(),
  }
})

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  const { useSyncExternalStore } = await import('react')
  const { useQuery } = await import('@tanstack/react-query')
  return {
    ...actual,
    useConnection: () =>
      useSyncExternalStore(
        (listener) => {
          io.listeners.add(listener)
          return () => io.listeners.delete(listener)
        },
        () => io.wallet,
      ),
    useDisconnect: () => ({ disconnectAsync: io.disconnect }),
    useEnsAvatar: ({
      name,
      query,
    }: {
      readonly name: string
      readonly query: { readonly enabled?: boolean }
    }) =>
      useQuery({
        queryKey: ['test-avatar', { name }],
        queryFn: () => io.avatar(name),
        ...query,
      }),
    useConnect: () => ({ mutateAsync: io.connect }),
    useSwitchChain: () => ({ switchChainAsync: io.switchChain }),
    useConnectors: () => [
      {
        id: 'io.metamask',
        uid: 'metamask',
        name: 'MetaMask',
        type: 'injected',
        getChainId: async () => 11155111,
      },
    ],
  }
})

vi.mock('@/lib/wagmi', async () => {
  const { sepolia } = await import('viem/chains')
  return { ensChain: sepolia, wagmiConfig: { chains: [sepolia] } }
})
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['test-owner', { name }],
    queryFn: () => io.owner(name),
  }),
}))
vi.mock('@/features/profile/hooks/useNameAvailability', () => ({
  getNameAvailabilityQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['test-availability', { name }],
    queryFn: () => io.availability(name),
  }),
}))
vi.mock('@/features/profile/hooks/useProfile', () => ({
  getProfileQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['test-profile', { name }],
    queryFn: () => io.profile(name),
  }),
}))
vi.mock('@/features/transfer/queries/getEthAddress', () => ({
  getEthAddressQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['test-eth-address', { name }],
    queryFn: () => io.ethAddress(name),
  }),
}))
vi.mock('@/features/records/hooks/useNameResolverAddress', () => ({
  getNameResolverAddressQueryOptions: ({
    name,
  }: {
    readonly name: string
  }) => ({
    queryKey: ['test-resolver', { name }],
    queryFn: () => io.resolver(name),
  }),
}))
vi.mock('@/features/profile/hooks/usePrimaryName', () => ({
  getPrimaryNameQueryOptions: (address: string | undefined) => ({
    queryKey: ['test-primary-name', { address }],
    queryFn: () => io.primaryName(address),
  }),
}))
vi.mock('@/features/dashboard/hooks/useAddressNames', () => ({
  getAddressNamesQueryOptions: ({ address }: { readonly address: string }) => ({
    queryKey: ['test-portfolio', { address }],
    queryFn: () => io.portfolio(address),
  }),
}))
vi.mock('@/hooks/useSupportsInterfaces', () => ({
  getSupportsInterfacesQueryOptions: ({
    address,
  }: {
    readonly address: string
  }) => ({
    queryKey: ['test-interfaces', { address }],
    queryFn: () => io.interfaces(address),
  }),
}))
vi.mock('@/features/profile/hooks/useDnsSecEnabled', () => ({
  getDnsSecEnabledQueryOptions: ({
    tld,
    enabled,
  }: {
    readonly tld: string
    readonly enabled: boolean
  }) => ({
    queryKey: ['test-dns', { tld }],
    enabled,
    queryFn: () => io.dns(tld),
  }),
}))

const WALLET_ADDRESS = '0x1111111111111111111111111111111111111111'

const Controls = ({
  onPageAction,
}: {
  readonly onPageAction?: () => Promise<void>
}) => {
  const { openPalette } = useCommandPalette()
  const { openConnectModal } = useConnectModal()
  const commands = useMemo(
    () =>
      onPageAction
        ? [
            {
              id: 'delayed-page',
              title: 'Delayed page action',
              onSelect: onPageAction,
            },
          ]
        : [],
    [onPageAction],
  )
  usePageCommands(commands)
  return (
    <>
      <HomeSearchInput isHero />
      <button type="button" onClick={() => openPalette()}>
        Open search
      </button>
      <button
        type="button"
        onClick={() =>
          openPalette({ entity: { type: 'name', name: 'ALICE.eth' } })
        }
      >
        Open unsafe name actions
      </button>
      <button
        type="button"
        onClick={() =>
          openPalette({ entity: { type: 'name', name: 'alice.eth' } })
        }
      >
        Open alice actions
      </button>
      <button type="button" onClick={() => openConnectModal()}>
        Open wallet chooser
      </button>
    </>
  )
}

const setup = async (onPageAction?: () => Promise<void>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ConnectModalProvider>
          <CommandPaletteProvider>
            <Controls onPageAction={onPageAction} />
            <Outlet />
          </CommandPaletteProvider>
        </ConnectModalProvider>
      </QueryClientProvider>
    ),
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <h1>Home</h1>,
  })
  const name = createRoute({
    getParentRoute: () => root,
    path: '/$name',
    component: () => <h1>Name destination</h1>,
  })
  const editor = createRoute({
    getParentRoute: () => root,
    path: '/$name/edit-records',
    component: () => <h1>Records editor</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, name, editor]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Home' })
  return { queryClient, router, user: userEvent.setup() }
}

const updateWallet = (snapshot: WalletSnapshot) =>
  act(() => {
    io.wallet = snapshot
    for (const notify of io.listeners) notify()
  })

beforeEach(() => {
  vi.clearAllMocks()
  io.wallet = { isConnected: false }
  io.listeners.clear()
  io.owner.mockResolvedValue({
    owner: WALLET_ADDRESS,
    registryAddress: WALLET_ADDRESS,
    protocolVersion: 'ENSv2',
  })
  io.availability.mockResolvedValue({ isAvailable: false })
  io.profile.mockResolvedValue({ records: { texts: [], coins: [] } })
  io.portfolio.mockResolvedValue([])
  io.interfaces.mockResolvedValue([])
  io.dns.mockResolvedValue(false)
  io.ethAddress.mockResolvedValue(null)
  io.avatar.mockResolvedValue(null)
  io.resolver.mockResolvedValue(null)
  io.primaryName.mockResolvedValue(null)
  localStorage.clear()
  cancelPaletteHandoff()
})

afterEach(() => {
  cancelPaletteHandoff()
  vi.restoreAllMocks()
})
afterAll(() => vi.unstubAllEnvs())

describe('CommandPaletteProvider integration', () => {
  it('ignores a prior clipboard failure after a newer palette session has begun', async () => {
    const { user } = await setup()
    const attempt = deferredFailure()
    const writeClipboard = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockReturnValue(attempt.promise)
    await user.click(screen.getByRole('button', { name: 'Open alice actions' }))
    await user.click(await screen.findByRole('option', { name: /^Copy name$/ }))
    await waitFor(() =>
      expect(writeClipboard).toHaveBeenCalledExactlyOnceWith('alice.eth'),
    )
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'website')
    await act(async () => attempt.reject(new Error('Clipboard access denied')))
    expect(screen.getByRole('combobox')).toHaveValue('website')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByText('alice.eth', { selector: '[data-palette-scope]' }),
    ).not.toBeInTheDocument()
  })

  it('ignores a late page-action failure after a newer palette session has begun', async () => {
    const attempt = deferredFailure()
    const onPageAction = vi.fn(() => attempt.promise)
    const { user } = await setup(onPageAction)
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.click(
      await screen.findByRole('option', { name: /^Delayed page action/ }),
    )
    await waitFor(() => expect(onPageAction).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'primary')
    await act(async () => attempt.reject(new Error('Page action failed')))
    expect(screen.getByRole('combobox')).toHaveValue('primary')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('owns one global shortcut across the real hero and toggles one root dialog', async () => {
    const { user } = await setup()
    await user.keyboard('{Control>}k{/Control}')
    expect(
      await screen.findByRole('dialog', { name: 'Search and actions' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Control>}k{/Control}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    await user.keyboard('{Control>}k{/Control}')
    expect(
      await screen.findByRole('dialog', { name: 'Search and actions' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('keeps closed and empty normal search free of entity reads and cold portfolio fetches', async () => {
    io.wallet = { isConnected: true, address: WALLET_ADDRESS }
    const { user } = await setup()
    expect(io.portfolio).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await screen.findByRole('dialog', { name: 'Search and actions' })
    expect(io.portfolio).not.toHaveBeenCalled()
    expect(io.owner).not.toHaveBeenCalled()
    expect(io.availability).not.toHaveBeenCalled()
    expect(io.profile).not.toHaveBeenCalled()
    expect(io.interfaces).not.toHaveBeenCalled()
    expect(io.dns).not.toHaveBeenCalled()
  })

  it('keeps command-only search from starting entity RPC after the actual debounce settles', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), '>renew')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)))
    expect(io.owner).not.toHaveBeenCalled()
    expect(io.availability).not.toHaveBeenCalled()
    expect(io.dns).not.toHaveBeenCalled()
    expect(io.portfolio).not.toHaveBeenCalled()
  })

  it('shows the current candidate before debounce without making the previous query actionable', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'alice.eth')
    expect(
      screen.getByRole('option', { name: /^alice.eth/ }),
    ).toBeInTheDocument()
    await user.clear(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'bob.eth')
    expect(screen.getByRole('option', { name: /^bob.eth/ })).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /^alice.eth/ }),
    ).not.toBeInTheDocument()
  })

  it('bounds verification to the leading candidate without DNS discovery', async () => {
    io.dns.mockResolvedValue(true)
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'fox')
    await waitFor(() => expect(io.availability).toHaveBeenCalledWith('fox.eth'))
    expect(io.owner).not.toHaveBeenCalled()
    expect(io.availability.mock.calls).toEqual([['fox.eth']])
    expect(io.dns).not.toHaveBeenCalled()
    expect(io.avatar).not.toHaveBeenCalled()
    expect(io.profile).not.toHaveBeenCalled()
    expect(io.portfolio).not.toHaveBeenCalled()
  })

  it('shows one ETH completion for a bare label without speculative DNS alternatives', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'helgesson')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('helgesson.eth')
  })

  it('opens an explicit DNS name without substituting an ETH completion or suggesting other suffixes', async () => {
    const { user, router } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'helgesson.com')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(
      screen.getByRole('option', { name: /^helgesson.com/ }),
    ).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/helgesson.com'),
    )
    expect(io.availability).not.toHaveBeenCalled()
  })

  it('does not fetch current-page relationships on empty opening or command search', async () => {
    const { user, router } = await setup()
    await act(async () =>
      router.navigate({ to: '/$name', params: { name: 'alice.eth' } }),
    )
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), '>renew')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)))
    expect(io.owner).not.toHaveBeenCalled()
    expect(io.profile).not.toHaveBeenCalled()
    expect(io.availability).not.toHaveBeenCalled()
  })

  it('copies a name’s resolved ETH address without substituting the connected wallet', async () => {
    const resolvedAddress = '0x2222222222222222222222222222222222222222'
    io.ethAddress.mockResolvedValue(resolvedAddress)
    const { user } = await setup()
    const writeClipboard = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue()
    await user.click(screen.getByRole('button', { name: 'Open alice actions' }))
    await user.click(
      await screen.findByRole('option', { name: /^Copy ETH address$/ }),
    )
    await waitFor(() =>
      expect(writeClipboard).toHaveBeenCalledExactlyOnceWith(resolvedAddress),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Connect a wallet' }),
    ).not.toBeInTheDocument()
  })

  it('retries a failed availability read without fetching ownership or other candidates', async () => {
    io.availability.mockRejectedValueOnce(new Error('RPC unavailable'))
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'fox')
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
    expect(io.availability.mock.calls).toEqual([['fox.eth'], ['fox.eth']])
    expect(io.owner).not.toHaveBeenCalled()
    expect(io.profile).not.toHaveBeenCalled()
  })

  it('restores an explicit target after wallet cancellation and never replays it on a later connection', async () => {
    const { user, router } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'renew')
    await user.click(await screen.findByRole('option', { name: /^Renew name/ }))
    await user.type(screen.getByRole('combobox'), 'bob.eth')
    await user.click(await screen.findByRole('option', { name: /^bob.eth/ }))
    await screen.findByRole('dialog', { name: 'Connect a wallet' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(
      screen.getByRole('dialog', { name: 'Connect a wallet' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await screen.findByRole('dialog', { name: 'Search and actions' })
    expect(screen.getByRole('combobox')).toHaveValue('bob.eth')
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
      'bob.eth',
    )
    await user.click(screen.getByRole('button', { name: 'Close search' }))
    await user.click(
      screen.getByRole('button', { name: 'Open wallet chooser' }),
    )
    await screen.findByRole('dialog', { name: 'Connect a wallet' })
    updateWallet({ isConnected: true, address: WALLET_ADDRESS })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe('/')
    expect(paletteHandoff.getSnapshot().pending).toBeNull()
  })

  it('clears a blocked action error and Retry on Back while returning focus for immediate typing', async () => {
    const { user } = await setup()
    await user.click(
      screen.getByRole('button', { name: 'Open unsafe name actions' }),
    )
    await user.click(
      await screen.findByRole('option', {
        name: /^Edit records$/,
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This spelling cannot safely enter',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(io.owner).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument()
    await user.keyboard('website')
    expect(screen.getByRole('combobox')).toHaveValue('website')
  })

  it('returns focus to the actual search input after Clear for immediate typing', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(screen.getByRole('combobox'), 'renew')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await user.keyboard('website')
    expect(screen.getByRole('combobox')).toHaveValue('website')
  })
})

const deferredFailure = () => {
  let reject: (cause: unknown) => void = () => {}
  const promise = new Promise<void>((_, onReject) => {
    reject = onReject
  })
  return { promise, reject }
}
