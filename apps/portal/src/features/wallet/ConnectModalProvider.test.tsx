import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectModalProvider, useConnectModal } from './ConnectModalProvider'

const wallet = vi.hoisted(() => ({
  isConnected: false,
  connect: vi.fn(),
  switchChain: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useConnection: () => ({ isConnected: wallet.isConnected }),
  useConnectors: () => [
    {
      id: 'io.metamask',
      uid: 'metamask',
      name: 'MetaMask',
      type: 'injected',
      getChainId: async () => 11155111,
    },
    {
      id: 'walletConnect',
      uid: 'walletconnect',
      name: 'WalletConnect',
      type: 'walletConnect',
      getChainId: async () => 11155111,
      getProvider: async () => ({}),
    },
  ],
  useConnect: () => ({ mutateAsync: wallet.connect }),
  useSwitchChain: () => ({ switchChainAsync: wallet.switchChain }),
}))

vi.mock('@/lib/wagmi', () => ({
  wagmiConfig: { chains: [{ id: 11155111 }] },
}))

const Harness = ({
  onResult,
}: {
  readonly onResult: (result: 'connected' | 'cancelled') => void
}) => {
  const { openConnectModal, cancelConnectContinuation, isConnectFlowActive } =
    useConnectModal()
  return (
    <>
      <output aria-label="Connection flow">
        {isConnectFlowActive ? 'active' : 'idle'}
      </output>
      <button type="button" onClick={() => openConnectModal({ onResult })}>
        Start intent
      </button>
      <button type="button" onClick={() => openConnectModal()}>
        Open chooser
      </button>
      <button type="button" onClick={() => cancelConnectContinuation()}>
        Cancel intent
      </button>
    </>
  )
}

const setup = () => {
  const onResult = vi.fn(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  const element = () => (
    <ConnectModalProvider>
      <Harness onResult={onResult} />
    </ConnectModalProvider>
  )
  const view = render(element())
  return {
    ...view,
    onResult,
    rerenderConnection: () => view.rerender(element()),
    user: userEvent.setup(),
  }
}

const deferredAttempt = () => {
  let resolve: () => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  wallet.isConnected = false
  wallet.connect.mockReset()
  wallet.switchChain.mockReset()
})

describe('wallet connection continuation', () => {
  it('reports an explicit dismissal once after removing the app dialog', async () => {
    const { user, onResult } = setup()
    await user.click(screen.getByRole('button', { name: 'Start intent' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledExactlyOnceWith('cancelled'),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not cancel when the app chooser closes for a WalletConnect pairing', async () => {
    const attempt = deferredAttempt()
    wallet.connect.mockReturnValue(attempt.promise)
    const { user, onResult } = setup()
    await user.click(screen.getByRole('button', { name: 'Start intent' }))
    await user.click(screen.getByRole('button', { name: 'WalletConnect' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Connection flow')).toHaveTextContent('active')
    expect(onResult).not.toHaveBeenCalled()
    await act(async () =>
      attempt.reject(new Error('User rejected the request')),
    )
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledExactlyOnceWith('cancelled'),
    )
    expect(screen.getByLabelText('Connection flow')).toHaveTextContent('idle')
  })

  it('waits for a WalletConnect pairing to settle even when the account becomes connected first', async () => {
    const attempt = deferredAttempt()
    wallet.connect.mockReturnValue(attempt.promise)
    const { user, onResult, rerenderConnection } = setup()
    await user.click(screen.getByRole('button', { name: 'Start intent' }))
    await user.click(screen.getByRole('button', { name: 'WalletConnect' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    wallet.isConnected = true
    rerenderConnection()
    expect(onResult).not.toHaveBeenCalled()
    await act(async () => attempt.resolve())
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledExactlyOnceWith('connected'),
    )
  })

  it('keeps an injected-wallet failure in the chooser and completes only after a successful retry closes it', async () => {
    wallet.connect.mockRejectedValueOnce(new Error('Provider failed'))
    wallet.connect.mockImplementationOnce(async () => {
      wallet.isConnected = true
    })
    const { user, onResult, rerenderConnection } = setup()
    await user.click(screen.getByRole('button', { name: 'Start intent' }))
    await user.click(screen.getByRole('button', { name: /MetaMask/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to connect wallet',
    )
    expect(onResult).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /MetaMask/ }))
    rerenderConnection()
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledExactlyOnceWith('connected'),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels the continuation without closing the chooser or replaying it after connection', async () => {
    const { user, onResult, rerenderConnection } = setup()
    await user.click(screen.getByRole('button', { name: 'Start intent' }))
    act(() =>
      screen
        .getByRole('button', { name: 'Cancel intent', hidden: true })
        .click(),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    wallet.isConnected = true
    rerenderConnection()
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(onResult).not.toHaveBeenCalled()
  })

  it('retains the existing no-argument chooser behavior', async () => {
    const { user, onResult } = setup()
    await user.click(screen.getByRole('button', { name: 'Open chooser' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(onResult).not.toHaveBeenCalled()
  })

  it('tracks the external connection flow even for callers without a continuation', async () => {
    const attempt = deferredAttempt()
    wallet.connect.mockReturnValue(attempt.promise)
    const { user, onResult } = setup()
    await user.click(screen.getByRole('button', { name: 'Open chooser' }))
    await user.click(screen.getByRole('button', { name: 'WalletConnect' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Connection flow')).toHaveTextContent('active')
    await act(async () =>
      attempt.reject(new Error('User rejected the request')),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Connection flow')).toHaveTextContent(
        'idle',
      ),
    )
    expect(onResult).not.toHaveBeenCalled()
  })

  it('finishes an eager connection once without an explicit connector attempt', async () => {
    const { user, onResult, rerenderConnection } = setup()
    await user.click(screen.getByRole('button', { name: 'Start intent' }))
    wallet.isConnected = true
    rerenderConnection()
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledExactlyOnceWith('connected'),
    )
    rerenderConnection()
    expect(onResult).toHaveBeenCalledTimes(1)
  })
})
