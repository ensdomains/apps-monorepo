import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient, TEST_ACCOUNTS } from '@/test-utils'
import { PaymentTokenSection } from './PaymentTokenSection'

// The reload tests stub the picker out (no token is ever selected, as after a
// reload); the price-failure tests need the real one.
let stubPicker = false
vi.mock('./PaymentTokenPicker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./PaymentTokenPicker')>()
  return {
    ...actual,
    PaymentTokenPicker: (
      props: ComponentProps<typeof actual.PaymentTokenPicker>,
    ) => (stubPicker ? null : <actual.PaymentTokenPicker {...props} />),
  }
})

describe('PaymentTokenSection', () => {
  const renderSection = (
    props: Partial<Parameters<typeof PaymentTokenSection>[0]>,
  ) =>
    render(
      <PaymentTokenSection
        name="leon.eth"
        duration={31_536_000}
        onConfirm={vi.fn()}
        isConnected
        {...props}
      />,
    )

  beforeEach(() => {
    stubPicker = true
  })

  it('reopens a registration under way without a token selected', () => {
    const onViewProgress = vi.fn()
    renderSection({ isRegistering: true, onViewProgress })

    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'View registration progress' }),
    )

    expect(onViewProgress).toHaveBeenCalledOnce()
  })

  it('offers both a fresh start and the failed run', () => {
    renderSection({ isRegistering: false, onViewProgress: vi.fn() })

    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'View registration progress' }),
    ).toBeEnabled()
  })

  it('shows only Register when there is no run', () => {
    renderSection({})

    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View registration progress' }),
    ).toBeNull()
  })
})

// Immunefi #92608 / #93006: a failed price read was priced at zero — $0.00 on
// screen, an empty wallet shown as "available", and the approval step dropped
// while the registrar still pulled its live price. A rejected price read must
// block checkout instead.

const getRegisterPrice = vi.fn()
vi.mock('@ensdomains/ensjs/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ensdomains/ensjs/public')>()),
  getRegisterPrice: (...args: unknown[]) => getRegisterPrice(...args),
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => ({}),
  useConnection: () => ({ address: TEST_ACCOUNTS.alice }),
}))

let balance = 0n
vi.mock('wagmi/query', () => ({
  readContractsQueryOptions: (
    _config: unknown,
    { contracts }: { contracts: { address: Address; functionName: string }[] },
  ) => ({
    queryKey: ['readContracts', contracts.map((c) => c.functionName)],
    queryFn: async () =>
      contracts.map((c) => ({
        status: 'success',
        result: c.functionName === 'balanceOf' ? balance : 0n,
      })),
  }),
}))

const USDC_PRICE = { base: 5_000_000n, premium: 0n }

describe('PaymentTokenSection — price reads', () => {
  const renderSection = (onConfirm = vi.fn()) => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <PaymentTokenSection
          name="example.eth"
          duration={31_536_000}
          onConfirm={onConfirm}
          isConnected
        />
      </QueryClientProvider>,
    )
    return { queryClient, onConfirm }
  }

  beforeEach(() => {
    stubPicker = false
    getRegisterPrice.mockReset()
    balance = 0n
  })

  it('shows an error and disables Register when the price read rejects', async () => {
    getRegisterPrice.mockRejectedValue(new Error('HTTP 500 from dRPC'))

    renderSection()

    expect(await screen.findByText("Couldn't load price")).toBeInTheDocument()
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText('available')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /USDC/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
  })

  it('recovers once a retry succeeds', async () => {
    getRegisterPrice.mockRejectedValueOnce(new Error('HTTP 500 from dRPC'))
    getRegisterPrice.mockRejectedValueOnce(new Error('HTTP 500 from dRPC'))
    getRegisterPrice.mockResolvedValue(USDC_PRICE)
    balance = 10_000_000n

    renderSection()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Try again' }),
    )

    expect(
      await screen.findByRole('button', { name: /USDC/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load price")).not.toBeInTheDocument()
  })

  it('reports insufficient balance against the real price on an empty wallet', async () => {
    getRegisterPrice.mockResolvedValue(USDC_PRICE)

    renderSection()

    expect(await screen.findByText('Insufficient balance')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
  })

  it('drops a held selection when a later price read fails', async () => {
    getRegisterPrice.mockResolvedValue(USDC_PRICE)
    balance = 10_000_000n

    const { queryClient, onConfirm } = renderSection()

    await userEvent.click(await screen.findByRole('button', { name: /USDC/ }))
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled()

    getRegisterPrice.mockRejectedValue(new Error('HTTP 500 from dRPC'))
    await queryClient.refetchQueries({ queryKey: ['get-registration-price'] })

    expect(await screen.findByText("Couldn't load price")).toBeInTheDocument()
    const register = screen.getByRole('button', { name: 'Register' })
    await waitFor(() => expect(register).toBeDisabled())
    await userEvent.click(register)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
