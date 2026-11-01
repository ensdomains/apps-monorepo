import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { WalletSection } from './WalletSection'

const session = vi.hoisted(() => ({
  hasActiveSession: false,
  isEnablingSession: false,
  isRevokingSession: false,
  revokeError: null as string | null,
  revokeErrorReason: null as string | null,
  enableSession: vi.fn(),
  forgetLocalSession: vi.fn(),
  revokeSession: vi.fn(),
  isSessionAccessReset: false,
  useEoa: false,
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    accountAddress: '0x1234567890123456789012345678901234567890',
    isLoading: false,
    ...session,
  }),
}))

vi.mock('@/utils/feature-flags', () => ({
  isFeatureEnabled: () => session.useEoa,
}))

vi.mock('@/utils/backend-client', () => ({ backendAuthStore: {} }))
vi.mock('@xstate/store-react', () => ({ useSelector: () => false }))
vi.mock('@/lib/wallet', () => ({
  useWalletDisconnect: () => ({
    disconnect: vi.fn(),
    isDisconnecting: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('WalletSection smart session safety controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.hasActiveSession = false
    session.isEnablingSession = false
    session.isRevokingSession = false
    session.revokeError = null
    session.revokeErrorReason = null
    session.isSessionAccessReset = false
    session.useEoa = false
    session.enableSession.mockResolvedValue({ status: 'enabled' })
    session.revokeSession.mockResolvedValue(true)
  })

  it('opens the safety confirmation without deleting the local session', async () => {
    session.hasActiveSession = true
    const onAction = vi.fn()
    const { rerender } = render(<WalletSection onAction={onAction} />)

    expect(screen.getByText('Smart sessions on')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Enable smart sessions' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText('Smart account')).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('0x1234')
    expect(dialog).toHaveTextContent('compromised')
    expect(dialog).toHaveTextContent('on this network')
    expect(dialog).toHaveTextContent('across every browser and device')
    expect(dialog).toHaveTextContent('ETH for gas')
    expect(session.forgetLocalSession).not.toHaveBeenCalled()
    expect(session.revokeSession).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Reset access' }),
    )
    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(session.revokeSession).toHaveBeenCalledWith(undefined)
    expect(session.forgetLocalSession).not.toHaveBeenCalled()

    session.hasActiveSession = false
    rerender(<WalletSection onAction={onAction} />)
    expect(screen.getByText('Smart sessions off')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enable smart sessions' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    ).toBeEnabled()
  })

  it('cancels the safety dialog without changing sessions', () => {
    session.hasActiveSession = true
    render(<WalletSection onAction={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(session.revokeSession).not.toHaveBeenCalled()
    expect(session.forgetLocalSession).not.toHaveBeenCalled()
    expect(screen.getByText('Smart sessions on')).toBeInTheDocument()
  })

  it('keeps the session and dialog when on-chain revocation fails', async () => {
    session.hasActiveSession = true
    session.revokeSession.mockResolvedValue(false)
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset access' }))
    await waitFor(() => expect(session.revokeSession).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Smart sessions on')).toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalled()
    expect(session.forgetLocalSession).not.toHaveBeenCalled()
  })

  it('offers deploy-and-revoke for an undeployed account, without local-only deletion', async () => {
    session.hasActiveSession = true
    session.revokeErrorReason = 'not-deployed'
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('two transactions')
    expect(screen.queryByText('Remove saved session')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Set up and reset access' }),
    )
    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(session.revokeSession).toHaveBeenCalledWith({ deployFirst: true })
    expect(session.forgetLocalSession).not.toHaveBeenCalled()
  })

  it('disables safety controls while revocation is pending', () => {
    session.hasActiveSession = true
    const { rerender } = render(<WalletSection onAction={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    session.isRevokingSession = true
    rerender(<WalletSection onAction={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Resetting access…' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(session.revokeSession).not.toHaveBeenCalled()
  })

  it('offers enable and reset when off and closes the menu after authorization', async () => {
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)

    expect(screen.getByText('Smart sessions off')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    ).toBeEnabled()
    expect(screen.queryByText('Revoke smart sessions')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable smart sessions' }),
    )

    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(session.enableSession).toHaveBeenCalledOnce()
    expect(session.forgetLocalSession).not.toHaveBeenCalled()
    expect(session.revokeSession).not.toHaveBeenCalled()
  })

  it('does not offer a second reset until a new session is signed', () => {
    session.isSessionAccessReset = true
    render(<WalletSection onAction={vi.fn()} />)

    const reset = screen.getByRole('button', {
      name: 'Smart session access reset',
    })
    expect(reset).toBeDisabled()
    fireEvent.click(reset)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enable smart sessions' }),
    ).toBeEnabled()
  })

  it('disables enable while its signature is pending', () => {
    session.isEnablingSession = true
    render(<WalletSection onAction={vi.fn()} />)

    const button = screen.getByRole('button', {
      name: 'Enabling smart sessions…',
    })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(session.enableSession).not.toHaveBeenCalled()
  })

  it.each(['declined', 'failed'] as const)(
    'keeps the menu open when enabling is %s',
    async (status) => {
      session.enableSession.mockResolvedValue({
        status,
        message: 'Enable failed',
      })
      const onAction = vi.fn()
      render(<WalletSection onAction={onAction} />)

      fireEvent.click(
        screen.getByRole('button', { name: 'Enable smart sessions' }),
      )
      await waitFor(() => expect(session.enableSession).toHaveBeenCalledOnce())

      expect(onAction).not.toHaveBeenCalled()
      expect(screen.getByText('Smart sessions off')).toBeInTheDocument()
      if (status === 'failed') {
        expect(toast.error).toHaveBeenCalledWith('Enable failed')
      } else {
        expect(toast.error).not.toHaveBeenCalled()
      }
    },
  )

  it('hides smart-session controls in EOA mode', () => {
    session.useEoa = true
    render(<WalletSection onAction={vi.fn()} />)

    expect(screen.queryByText('Smart sessions off')).not.toBeInTheDocument()
    expect(screen.queryByText('Enable smart sessions')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Reset smart session access'),
    ).not.toBeInTheDocument()
  })
})
