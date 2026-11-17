import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connector } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { useConnectModal } from '@/lib/wallet'
import { ConnectModalProvider } from '@/lib/wallet/stacks/custom/ConnectModalProvider'
import { backendAuthStore } from '@/utils/backend-client'
import { render } from '@/utils/test-utils'

const wagmiMock = vi.hoisted(() => ({
  useConnection: vi.fn(),
  useConnectors: vi.fn((): readonly Connector[] => []),
  useConnect: vi.fn(() => ({ mutateAsync: vi.fn() })),
  connectionEffects: vi.fn(),
  useSwitchChain: vi.fn(() => ({ switchChainAsync: vi.fn() })),
}))

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContextSafe: vi.fn(),
}))

const useMutationMock = vi.hoisted(() => vi.fn())

const walletDisconnectMock = vi.hoisted(() => ({
  disconnect: vi.fn(),
  isDisconnecting: false,
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: wagmiMock.useConnection,
    useConnectors: wagmiMock.useConnectors,
    useConnect: wagmiMock.useConnect,
    useSwitchChain: wagmiMock.useSwitchChain,
    useConnectionEffect: (
      parameters: Parameters<typeof actual.useConnectionEffect>[0],
    ) => {
      wagmiMock.connectionEffects(parameters)
      return actual.useConnectionEffect(parameters)
    },
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

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useMutation: useMutationMock,
  }
})

import { BackendAuthModal } from './BackendAuthModal'

const pressKeys = (keys: string[]) => {
  for (const key of keys) {
    fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` })
  }
}

const showModal = ({
  isError = false,
  isPending = false,
}: {
  isError?: boolean
  isPending?: boolean
} = {}) => {
  wagmiMock.useConnection.mockReturnValue({ isConnected: true })
  smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
    isAccountReady: true,
    walletClient: { account: { address: '0xabc' } },
  })
  useMutationMock.mockReturnValue({
    isPending,
    isError,
    mutateAsync: vi.fn(),
  })
  walletDisconnectMock.disconnect.mockReset()
  walletDisconnectMock.isDisconnecting = false
}

describe('BackendAuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signOut()
    backendAuthStore.trigger.resetModal()
    showModal()
  })

  it('does not render visible skip controls', () => {
    render(<BackendAuthModal />)

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
    render(<BackendAuthModal />)

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
    wagmiMock.useConnection.mockReturnValue({ isConnected: false })

    render(<BackendAuthModal />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    pressKeys(['s', 'k', 'i', 'p'])

    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })

  it('does not dismiss when the sign-in mutation is pending', () => {
    showModal({ isPending: true })

    render(<BackendAuthModal />)

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()

    pressKeys(['s', 'k', 'i', 'p'])

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })

  it('only offers to continue without signing in after sign-in fails', () => {
    render(<BackendAuthModal />)

    expect(
      screen.queryByRole('button', { name: 'Continue without signing in' }),
    ).not.toBeInTheDocument()
  })

  it('shows a retry and dismiss action after sign-in fails', () => {
    showModal({ isError: true })

    render(<BackendAuthModal />)

    expect(
      screen.getByText("Signing didn't go through. Please try again."),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })

  it('confirms what is lost before continuing without signing in', () => {
    showModal({ isError: true })

    render(<BackendAuthModal />)

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
    showModal({ isError: true })

    render(<BackendAuthModal />)

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

  it('retries sign-in from the skip confirmation', () => {
    showModal({ isError: true })
    const { mutateAsync } = useMutationMock()

    render(<BackendAuthModal />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(mutateAsync).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })

  it('disconnects the wallet so the user can switch accounts', () => {
    render(<BackendAuthModal />)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(walletDisconnectMock.disconnect).toHaveBeenCalledOnce()
  })

  it('does not dismiss when Escape is pressed', () => {
    render(<BackendAuthModal />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(
      screen.getByRole('alertdialog', { name: 'Authenticate to continue' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })
})

describe('BackendAuthModal, connecting through the connect dialog', () => {
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

  const setAccount = (isAccountReady: boolean) =>
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      isAccountReady,
      error: null,
      walletClient: isAccountReady ? { account: { address: '0xabc' } } : null,
    })

  // Attach the listener before connect so tests can settle even before injected chain detection finishes.
  const deferConnect = () => {
    const settled = new EventTarget()
    const gate = new Promise<void>((resolve, reject) => {
      settled.addEventListener(
        'settle',
        (event) =>
          event instanceof CustomEvent && event.detail
            ? reject(event.detail)
            : resolve(),
        { once: true },
      )
    })
    wagmiMock.useConnect.mockReturnValue({
      mutateAsync: vi.fn(() =>
        gate.then(() => {
          wagmiMock.useConnection.mockReturnValue({ isConnected: true })
          wagmiMock.connectionEffects.mock.lastCall?.[0].onConnect({
            isReconnected: false,
          })
        }),
      ),
    })
    return {
      resolve: () => settled.dispatchEvent(new CustomEvent('settle')),
      reject: (error: Error) =>
        settled.dispatchEvent(new CustomEvent('settle', { detail: error })),
    }
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
    <ConnectModalProvider>
      <OpenConnect />
    </ConnectModalProvider>
  )

  const openWalletList = () => {
    const view = render(renderUi())
    fireEvent.click(screen.getByRole('button', { name: 'Open connect' }))
    return {
      ...view,
      dialog: screen.getByRole('dialog', { name: 'Connect a wallet' }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signOut()
    backendAuthStore.trigger.resetModal()
    wagmiMock.useConnection.mockReturnValue({ isConnected: false })
    wagmiMock.useConnectors.mockReturnValue([METAMASK, WALLETCONNECT])
    setAccount(false)
    useMutationMock.mockReturnValue({
      isPending: false,
      isError: false,
      mutateAsync: vi.fn(async () => {
        backendAuthStore.trigger.signIn({ authKey: 'key', address: '0xabc' })
      }),
    })
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

    setAccount(true)
    rerender(renderUi())
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
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
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(true)
  })

  it.each(['signed-in', 'skipped'] as const)(
    'finishes a connect with existing %s state so a later sign-in request is standalone',
    async (authState) => {
      if (authState === 'signed-in') {
        backendAuthStore.trigger.signIn({ authKey: 'key', address: '0xabc' })
      } else {
        backendAuthStore.trigger.dismissModal()
      }
      setAccount(true)
      const connect = deferConnect()
      openWalletList()

      fireEvent.click(screen.getByRole('button', { name: /MetaMask/ }))
      await act(async () => connect.resolve())

      expect(
        screen.getByRole('button', { name: 'Open connect' }),
      ).toHaveAttribute('aria-expanded', 'false')
      act(() => {
        backendAuthStore.trigger.signOut()
        backendAuthStore.trigger.resetModal()
      })

      expect(
        await screen.findByRole('alertdialog', {
          name: 'Authenticate to continue',
        }),
      ).toHaveAttribute('data-slot', 'alert-dialog-content')
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
    const switched = new EventTarget()
    const switching = new Promise<void>((resolve) => {
      switched.addEventListener('done', () => resolve(), { once: true })
    })
    const switchChainAsync = vi.fn(() => switching)
    wagmiMock.useSwitchChain.mockReturnValue({ switchChainAsync })
    wagmiMock.useConnectors.mockReturnValue([
      makeConnector({ ...WALLETCONNECT, getChainId: async () => -1 }),
    ])
    wagmiMock.useConnect.mockReturnValue({
      mutateAsync: vi.fn(async () => {
        wagmiMock.useConnection.mockReturnValue({ isConnected: true })
        wagmiMock.connectionEffects.mock.lastCall?.[0].onConnect({
          isReconnected: false,
        })
      }),
    })
    const { rerender } = openWalletList()
    fireEvent.click(screen.getByRole('button', { name: /WalletConnect/ }))
    await waitFor(() => expect(switchChainAsync).toHaveBeenCalledOnce())
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      'Authenticate to continue',
    )

    act(() => {
      wagmiMock.useConnection.mockReturnValue({ isConnected: false })
      wagmiMock.connectionEffects.mock.lastCall?.[0].onDisconnect()
    })
    rerender(renderUi())
    fireEvent.click(screen.getByRole('button', { name: 'Open connect' }))
    await act(async () => switched.dispatchEvent(new Event('done')))

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
