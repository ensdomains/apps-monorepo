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

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: wagmiMock.useConnection,
    useWalletClient: wagmiMock.useWalletClient,
  }
})

vi.mock('@/lib/smart-account/SmartAccountContext', () => smartAccountMock)

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

const showModal = ({ isPending = false }: { isPending?: boolean } = {}) => {
  wagmiMock.useConnection.mockReturnValue({ isConnected: true })
  wagmiMock.useWalletClient.mockReturnValue({
    data: { account: { address: '0xabc' } },
  })
  smartAccountMock.useSmartAccountContextSafe.mockReturnValue(null)
  useMutationMock.mockReturnValue({
    isPending,
    isError: false,
    mutateAsync: vi.fn(),
  })
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

  it('does not dismiss when Escape is pressed', () => {
    render(<BackendAuthModal />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(
      screen.getByRole('alertdialog', { name: 'Verify your wallet' }),
    ).toBeInTheDocument()
    expect(backendAuthStore.get().context.modalDismissed).toBe(false)
  })
})
