import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backendAuthStore } from '@/utils/backend-client'
import { render } from '@/utils/test-utils'

const wagmiMock = vi.hoisted(() => ({
  useConnection: vi.fn(),
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
