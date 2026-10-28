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
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))
// The section renders outside a router here; a plain anchor is enough to
// follow the link's wiring.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    onClick,
  }: {
    readonly children: React.ReactNode
    readonly onClick?: () => void
  }) => (
    <a href="/register" onClick={onClick}>
      {children}
    </a>
  ),
}))

const leftover = vi.hoisted(() => ({
  leftover: undefined as
    | {
        isDeployed: boolean
        funds: readonly unknown[]
        heldForRegistration?: string | null
      }
    | undefined,
  isLoading: false,
  isError: false,
  isWithdrawing: false,
  withdrawError: null as string | null,
  withdraw: vi.fn(),
}))

vi.mock('@/features/wallet/hooks/useLeftoverFunds', () => ({
  useLeftoverFunds: () => leftover,
}))

const USDC_LEFTOVER = {
  isDeployed: true,
  funds: [
    {
      token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      symbol: 'USDC',
      decimals: 6,
      amount: 2_713_400n,
    },
  ],
}

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
    leftover.leftover = undefined
    leftover.withdraw.mockResolvedValue({ status: 'withdrawn' })
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

  const resetAccess = () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset access' }))
  }

  it('returns leftover funds to the wallet once the reset confirms', async () => {
    leftover.leftover = USDC_LEFTOVER
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('2.7134 USDC')

    fireEvent.click(screen.getByRole('button', { name: 'Reset access' }))
    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(leftover.withdraw).toHaveBeenCalledOnce()
    expect(session.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(
      leftover.withdraw.mock.invocationCallOrder[0] ?? 0,
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('leaves the funds alone when the reset fails', async () => {
    leftover.leftover = USDC_LEFTOVER
    session.revokeSession.mockResolvedValue(false)
    render(<WalletSection onAction={vi.fn()} />)
    resetAccess()

    await waitFor(() => expect(session.revokeSession).toHaveBeenCalledOnce())
    expect(leftover.withdraw).not.toHaveBeenCalled()
  })

  it('completes the reset and points to the menu item when the refund does not go through', async () => {
    leftover.leftover = USDC_LEFTOVER
    leftover.withdraw.mockResolvedValue({ status: 'declined' })
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    resetAccess()

    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Withdraw leftover funds'),
    )
  })

  it('still returns the funds when reset is confirmed before the balance loads', async () => {
    leftover.leftover = undefined
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    resetAccess()

    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(leftover.withdraw).toHaveBeenCalledOnce()
  })

  it('withdraws leftover funds from the menu', async () => {
    leftover.leftover = USDC_LEFTOVER
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw leftover funds' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('2.7134')
    expect(dialog).toHaveTextContent('ETH for gas')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw to wallet' }),
    )
    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(leftover.withdraw).toHaveBeenCalledOnce()
    expect(session.revokeSession).not.toHaveBeenCalled()
  })

  it('keeps the withdraw dialog open when the withdrawal fails', async () => {
    leftover.leftover = USDC_LEFTOVER
    leftover.withdraw.mockResolvedValue({ status: 'failed' })
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw leftover funds' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw to wallet' }))

    await waitFor(() => expect(leftover.withdraw).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('holds the funds while a registration waits on them, and links back to it', () => {
    leftover.leftover = { ...USDC_LEFTOVER, heldForRegistration: 'leon.eth' }
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw leftover funds' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('registration of leon.eth')
    expect(
      within(dialog).getByRole('button', { name: 'Withdraw to wallet' }),
    ).toBeDisabled()
    fireEvent.click(
      within(dialog).getByRole('link', { name: 'Continue registration' }),
    )
    expect(onAction).toHaveBeenCalledOnce()
    expect(leftover.withdraw).not.toHaveBeenCalled()
  })

  it('still resets access when a registration keeps the funds in place', async () => {
    leftover.leftover = { ...USDC_LEFTOVER, heldForRegistration: 'leon.eth' }
    leftover.withdraw.mockResolvedValue({
      status: 'held',
      registrationName: 'leon.eth',
    })
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset smart session access' }),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'your registration of leon.eth needs',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset access' }))

    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(session.revokeSession).toHaveBeenCalledOnce()
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('leon.eth'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('offers nothing to withdraw from an empty account', () => {
    leftover.leftover = { isDeployed: true, funds: [] }
    render(<WalletSection onAction={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw leftover funds' }),
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('no leftover funds')
    expect(
      screen.getByRole('button', { name: 'Withdraw to wallet' }),
    ).toBeDisabled()
  })

  it('offers no withdrawal in EOA mode, where there is no smart account', () => {
    session.useEoa = true
    render(<WalletSection onAction={vi.fn()} />)

    expect(
      screen.queryByText('Withdraw leftover funds'),
    ).not.toBeInTheDocument()
  })

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
