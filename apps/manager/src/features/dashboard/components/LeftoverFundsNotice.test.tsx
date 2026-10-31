import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { LeftoverFundsNotice } from './LeftoverFundsNotice'

// A plain anchor is enough to follow the link's wiring outside a router.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    params,
  }: {
    readonly children: React.ReactNode
    readonly to: string
    readonly params?: { name?: string }
  }) => <a href={`${to}/${params?.name ?? ''}`}>{children}</a>,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
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

describe('LeftoverFundsNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leftover.leftover = undefined
    leftover.isError = false
    leftover.withdraw.mockResolvedValue({ status: 'withdrawn' })
  })

  it('shows the balance and withdraws it without leaving the dashboard', async () => {
    leftover.leftover = USDC_LEFTOVER
    render(<LeftoverFundsNotice />)

    expect(screen.getByRole('status')).toHaveTextContent('2.7134 USDC')
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('2.7134')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw to wallet' }),
    )

    await waitFor(() => expect(leftover.withdraw).toHaveBeenCalledOnce())
    expect(toast.success).toHaveBeenCalledOnce()
  })

  it('points at the registration instead of offering a withdrawal', () => {
    leftover.leftover = { ...USDC_LEFTOVER, heldForRegistration: 'leon.eth' }
    render(<LeftoverFundsNotice />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'registration of leon.eth',
    )
    expect(
      screen.getByText('Continue registration').closest('a'),
    ).toHaveAttribute('href', '/register/$name/leon.eth')
    expect(
      screen.queryByRole('button', { name: 'Withdraw' }),
    ).not.toBeInTheDocument()
  })

  it('hides a known balance once a read fails', () => {
    leftover.leftover = USDC_LEFTOVER
    leftover.isError = true
    const { container } = render(<LeftoverFundsNotice />)

    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['held', { heldForRegistration: 'leon.eth' }, false],
    ['failed', {}, true],
  ])(
    'keeps an open dialog when the re-read comes back %s',
    (_, patch, isError) => {
      leftover.leftover = USDC_LEFTOVER
      const { rerender } = render(<LeftoverFundsNotice />)
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

      leftover.leftover = { ...USDC_LEFTOVER, ...patch }
      leftover.isError = isError
      rerender(<LeftoverFundsNotice />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    },
  )
})
