import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Connector, createConfig, http, WagmiProvider } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { wagmiConfig } from '@/lib/wagmi'
import { useConnectModal } from '@/lib/wallet'
import { backendAuthStore } from '@/utils/backend-client'
import { render } from '@/utils/test-utils'
import { WalletConnectionProvider as Provider } from './WalletConnectionProvider'

const wagmiMock = vi.hoisted(() => ({
  useConnectors: vi.fn((): readonly Connector[] => []),
  useConnect: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useSwitchChain: vi.fn(() => ({ switchChainAsync: vi.fn() })),
}))

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContextSafe: vi.fn(),
}))

const signInMock = vi.hoisted(() => vi.fn())

const walletDisconnectMock = vi.hoisted(() => ({
  disconnect: vi.fn(),
  isDisconnecting: false,
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnectors: wagmiMock.useConnectors,
    useConnect: wagmiMock.useConnect,
    useSwitchChain: wagmiMock.useSwitchChain,
  }
})

vi.mock('@/lib/smart-account/SmartAccountContext', () => smartAccountMock)

vi.mock('@/lib/wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wallet')>()
  return {
    ...actual,
    useWalletDisconnect: () => walletDisconnectMock,
  }
})

vi.mock(
  '@/features/notifications/data/queries/auth',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/notifications/data/queries/auth')
    >()),
    signInBackendMutation: { mutationFn: signInMock },
  }),
)

const testConfig = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http('http://mock.local') },
  multiInjectedProviderDiscovery: false,
  storage: null,
})
const APP_CHAIN_ID = wagmiConfig.chains[0].id
const makeConnector = (fields: Partial<Connector>): Connector =>
  ({
    type: 'injected',
    getChainId: async () => APP_CHAIN_ID,
    ...fields,
  }) as Connector
const METAMASK = makeConnector({
  id: 'io.metamask',
  uid: 'metamask',
  name: 'MetaMask',
})
const WALLETCONNECT = makeConnector({
  id: 'walletConnect',
  uid: 'walletconnect',
  name: 'WalletConnect',
  type: 'walletConnect',
})

const setWallet = (
  connector: Connector | null,
  chainId: number = mainnet.id,
) => {
  testConfig.setState((state) => ({
    ...state,
    status: connector ? 'connected' : 'disconnected',
    current: connector?.uid ?? null,
    connections: connector
      ? new Map([
          [connector.uid, { accounts: [zeroAddress], chainId, connector }],
        ])
      : new Map(),
  }))
}

const WalletConnectionProvider = (props: ComponentProps<typeof Provider>) => (
  <WagmiProvider config={testConfig} reconnectOnMount={false}>
    <Provider {...props} />
  </WagmiProvider>
)

const deferred = () => {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const pressKeys = (keys: string[]) => {
  for (const key of keys) {
    fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` })
  }
}

const showModal = () => {
  setWallet(METAMASK)
  smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
    isAccountReady: true,
    walletClient: { account: { address: '0xabc' } },
  })
  signInMock.mockReset()
  signInMock.mockImplementation(async () => {
    backendAuthStore.trigger.signIn({ authKey: 'key', address: '0xabc' })
  })
  walletDisconnectMock.disconnect.mockReset()
  walletDisconnectMock.isDisconnecting = false
}

const failSignIn = async () => {
  signInMock.mockRejectedValueOnce(new Error('User rejected signing'))
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('button', { name: 'Try again' })
}

describe('WalletConnectionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signOut()
    backendAuthStore.trigger.resetModal()
    showModal()
  })

  it('does not render visible skip controls', () => {
    render(<WalletConnectionProvider />)

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Skip for now' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Skip Anyway' }),
    ).not.toBeInTheDocument()
  })

  it('dismisses the modal when SKIP is typed while it is open', async () => {
    render(<WalletConnectionProvider />)

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()

    pressKeys(['s', 'k', 'i', 'p'])

    await waitFor(() => {
      expect(
        screen.queryByRole('alertdialog', { name: 'Authenticate to continue' }),
      ).not.toBeInTheDocument()
    })
    expect(backendAuthStore.get().context.modalDismissed).toBe(true)
  })

  it('does not dismiss when SKIP is typed while the modal is closed', () => {
    setWallet(null)

    render(<WalletConnectionProvider />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    pressKeys(['s', 'k', 'i', 'p'])

    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })

  it('blocks skip and another signature while signing is pending, even after switching wallets', async () => {
    const signature = deferred()
    signInMock.mockReturnValue(signature.promise)

    render(<WalletConnectionProvider />)

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    pressKeys(['s', 'k', 'i', 'p'])

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)

    await screen.findByRole('button', { name: 'Signing in...' })
    act(() => setWallet(WALLETCONNECT))
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
    pressKeys(['s', 'k', 'i', 'p'])
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)

    await act(async () => signature.reject(new Error('User rejected signing')))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('only offers to continue without signing in after sign-in fails', () => {
    render(<WalletConnectionProvider />)

    expect(
      screen.queryByRole('button', { name: 'Continue without signing in' }),
    ).not.toBeInTheDocument()
  })

  it('shows a retry and dismiss action after sign-in fails', async () => {
    render(<WalletConnectionProvider />)
    await failSignIn()

    expect(
      screen.getByText("Signing didn't go through. Please try again."),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })

  it('confirms what is lost before continuing without signing in', async () => {
    render(<WalletConnectionProvider />)
    await failSignIn()

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    )

    expect(
      screen.getByRole('alertdialog', { name: 'Continue without signing in?' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/enables notifications for transfers and expirations/),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(backendAuthStore.get().context.modalDismissed).toBe(true)
  })

  it('reopens at sign-in after SKIP closes the skip confirmation', async () => {
    render(<WalletConnectionProvider />)
    await failSignIn()

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    )
    pressKeys(['s', 'k', 'i', 'p'])

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    act(() => {
      backendAuthStore.trigger.resetModal()
    })

    expect(
      await screen.findByRole('alertdialog', {
        name: 'Authenticate to continue',
      }),
    ).toBeInTheDocument()
  })

  it('retries sign-in from the skip confirmation', async () => {
    render(<WalletConnectionProvider />)
    await failSignIn()
    signInMock.mockImplementation(() => new Promise(() => {}))

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(2))
    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })

  it('disables retry from the skip confirmation while the account prepares again', async () => {
    const { rerender } = render(<WalletConnectionProvider />)
    await failSignIn()
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    )

    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      isAccountReady: false,
      error: null,
      walletClient: { account: { address: '0xabc' } },
    })
    rerender(<WalletConnectionProvider />)

    const retry = screen.getByRole('button', { name: 'Sign in' })
    expect(retry).toBeDisabled()
    fireEvent.click(retry)
    expect(signInMock).toHaveBeenCalledOnce()
  })

  it('disconnects the wallet so the user can switch accounts', () => {
    render(<WalletConnectionProvider />)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(walletDisconnectMock.disconnect).toHaveBeenCalledOnce()
  })

  it('clears a failed signature when another wallet connects after disconnect', async () => {
    render(<WalletConnectionProvider />)
    await failSignIn()

    act(() => setWallet(METAMASK, sepolia.id))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()

    act(() => setWallet(null))
    act(() => setWallet(WALLETCONNECT))

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Continue without signing in' }),
    ).not.toBeInTheDocument()
  })

  it('does not dismiss when Escape is pressed', () => {
    render(<WalletConnectionProvider />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })
})

describe('WalletConnectionProvider, connecting through the connect dialog', () => {
  const setAccount = (isAccountReady: boolean) =>
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      isAccountReady,
      error: null,
      walletClient: isAccountReady ? { account: { address: '0xabc' } } : null,
    })

  const deferConnect = () => {
    const gate = deferred()
    wagmiMock.useConnect.mockReturnValue({
      mutateAsync: vi.fn(async ({ connector }) => {
        await gate.promise
        testConfig.setState((state) => ({ ...state, status: 'connecting' }))
        setWallet(connector)
      }),
    })
    return gate
  }

  const OpenConnect = () => {
    const { openConnectModal, connectModalOpen } = useConnectModal()
    return (
      <button
        aria-expanded={connectModalOpen}
        onClick={openConnectModal}
        type="button"
      >
        Open connect
      </button>
    )
  }

  const renderUi = () => (
    <WalletConnectionProvider>
      <OpenConnect />
    </WalletConnectionProvider>
  )

  const openWalletList = () => {
    const view = render(renderUi())
    const trigger = screen.getByRole('button', { name: 'Open connect' })
    fireEvent.click(trigger)
    return {
      trigger,
      ...view,
      dialog: screen.getByRole('dialog', { name: 'Connect a wallet' }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signOut()
    backendAuthStore.trigger.resetModal()
    setWallet(null)
    wagmiMock.useConnectors.mockReturnValue([METAMASK, WALLETCONNECT])
    setAccount(false)
    signInMock.mockReset()
    signInMock.mockImplementation(async () => {
      backendAuthStore.trigger.signIn({ authKey: 'key', address: '0xabc' })
    })
  })

  it('closes the picker when a wallet connects directly from its extension', async () => {
    const { trigger, rerender } = openWalletList()
    act(() => setWallet(METAMASK))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    setAccount(true)
    rerender(renderUi())
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName(
      'Authenticate to continue',
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('steps the same dialog on to sign-in, waits for the account, then closes once signed in', async () => {
    const connect = deferConnect()
    const { dialog, rerender } = openWalletList()

    fireEvent.click(screen.getByRole('button', { name: /MetaMask/ }))
    await act(async () => connect.resolve())

    expect(
      await screen.findByRole('alertdialog', {
        name: 'Authenticate to continue',
      }),
    ).toBe(dialog)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Authenticate to continue' }),
    ).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Preparing your account…' }),
    ).toBeDisabled()
    expect(screen.queryByText(/Wallet client missing/)).not.toBeInTheDocument()

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()

    rerender(renderUi())
    expect(screen.getByRole('alertdialog')).toBe(dialog)
    expect(
      screen.getByRole('button', { name: 'Preparing your account…' }),
    ).toBeDisabled()

    setAccount(true)
    rerender(renderUi())
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('continues a pending connection after dismissing and reopening the picker', async () => {
    const connect = deferConnect()
    const { trigger } = openWalletList()
    fireEvent.click(screen.getByRole('button', { name: /MetaMask/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(trigger)

    expect(screen.getByRole('button', { name: /MetaMask/ })).toBeDisabled()
    await act(async () => connect.resolve())

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Preparing your account…' }),
    ).toBeDisabled()
  })

  it('closes the sign-in step when SKIP is typed', async () => {
    const connect = deferConnect()
    openWalletList()

    fireEvent.click(screen.getByRole('button', { name: /MetaMask/ }))
    await act(async () => connect.resolve())
    await screen.findByRole('alertdialog', { name: 'Authenticate to continue' })
    pressKeys(['s', 'k', 'i', 'p'])

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(backendAuthStore.get().context.modalDismissed).toBe(true)
  })

  it.each([
    ['signed-in', 'MetaMask'],
    ['skipped', 'WalletConnect'],
  ] as const)(
    'finishes an already-connected %s wallet through %s so a later sign-in request is standalone',
    async (authState, connectorName) => {
      if (authState === 'signed-in') {
        backendAuthStore.trigger.signIn({ authKey: 'key', address: '0xabc' })
      } else {
        backendAuthStore.trigger.dismissModal()
      }
      setAccount(true)
      setWallet(METAMASK)
      wagmiMock.useConnect.mockReturnValue({
        mutateAsync: vi.fn(async () => {}),
      })
      const { trigger } = openWalletList()

      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(connectorName) }),
      )
      await waitFor(() =>
        expect(trigger).toHaveAttribute('aria-expanded', 'false'),
      )
      act(() => {
        backendAuthStore.trigger.signOut()
        backendAuthStore.trigger.resetModal()
      })

      expect(
        await screen.findByRole('alertdialog', {
          name: 'Authenticate to continue',
        }),
      ).toHaveAttribute('data-slot', 'dialog-content')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    },
  )

  it('hides behind the WalletConnect modal and comes back at sign-in once paired', async () => {
    const connect = deferConnect()
    openWalletList()

    fireEvent.click(screen.getByRole('button', { name: /WalletConnect/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await act(async () => connect.resolve())

    expect(
      await screen.findAllByRole('alertdialog', {
        name: 'Authenticate to continue',
      }),
    ).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps a reopened wallet list when an earlier chain switch finishes after disconnect', async () => {
    const switching = deferred()
    const switchChainAsync = vi.fn(() => switching.promise)
    wagmiMock.useSwitchChain.mockReturnValue({ switchChainAsync })
    wagmiMock.useConnectors.mockReturnValue([
      makeConnector({ ...WALLETCONNECT, getChainId: async () => -1 }),
    ])
    wagmiMock.useConnect.mockReturnValue({
      mutateAsync: vi.fn(async ({ connector }) => {
        testConfig.setState((state) => ({ ...state, status: 'connecting' }))
        setWallet(connector)
      }),
    })
    const { rerender } = openWalletList()
    fireEvent.click(screen.getByRole('button', { name: /WalletConnect/ }))
    await waitFor(() => expect(switchChainAsync).toHaveBeenCalledOnce())
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      'Authenticate to continue',
    )

    act(() => setWallet(null))
    rerender(renderUi())
    fireEvent.click(screen.getByRole('button', { name: 'Open connect' }))
    await act(async () => switching.resolve())

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Connect a wallet' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['cancelled', new Error('User rejected the request.'), null],
    ['failed', new Error('relay down'), 'Unable to connect wallet'],
  ])(
    'after WalletConnect pairing is %s, shows the wallet list only to report an error',
    async (_outcome, error, message) => {
      const connect = deferConnect()
      openWalletList()

      fireEvent.click(screen.getByRole('button', { name: /WalletConnect/ }))
      await act(async () => connect.reject(error))

      if (message === null) {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        return
      }
      expect(
        screen.getByRole('dialog', { name: 'Connect a wallet' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(message)
    },
  )
})
