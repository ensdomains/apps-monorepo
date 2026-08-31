import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backendAuthStore } from '@/utils/backend-client'
import { render } from '@/utils/test-utils'

const wagmiMock = vi.hoisted(() => ({
  useConnection: vi.fn(),
  useWalletClient: vi.fn(),
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
    useWalletClient: wagmiMock.useWalletClient,
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
  wagmiMock.useWalletClient.mockReturnValue({
    data: { account: { address: '0xabc' } },
  })
  smartAccountMock.useSmartAccountContextSafe.mockReturnValue(null)
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
      screen.getByRole('alertdialog', { name: 'Verify your wallet' }),
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
      screen.getByRole('alertdialog', { name: 'Verify your wallet' }),
    ).toBeInTheDocument()

    pressKeys(['s', 'k', 'i', 'p'])

    await waitFor(() => {
      expect(
        screen.queryByRole('alertdialog', { name: 'Verify your wallet' }),
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
      screen.getByRole('alertdialog', { name: 'Verify your wallet' }),
    ).toBeInTheDocument()

    pressKeys(['s', 'k', 'i', 'p'])

    expect(
      screen.getByRole('alertdialog', { name: 'Verify your wallet' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })

  it('shows a dismiss action after sign-in fails', () => {
    showModal({ isError: true })

    render(<BackendAuthModal />)

    expect(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "You can still use the manager, but these features won't be available:",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Domain transfer and expiry notifications'),
    ).toBeInTheDocument()
    expect(screen.getByText('Saved favorites and searches')).toBeInTheDocument()
    expect(
      screen.getByText(
        'To enable these features later, open your wallet menu and select Verify wallet ownership.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue without signing in' }),
    )

    expect(backendAuthStore.get().context.modalDismissed).toBe(true)
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
      screen.getByRole('alertdialog', { name: 'Verify your wallet' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })
})
