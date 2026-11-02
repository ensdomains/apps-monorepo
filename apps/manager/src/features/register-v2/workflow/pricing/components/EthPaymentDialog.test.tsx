import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEthSwapQuote } from '../../../service/ethPayment'
import { executeEthPayment } from '../../../service/executeEthPayment'
import { EthPaymentDialog } from './EthPaymentDialog'

vi.mock('../../../service/ethPayment', () => ({
  getEthSwapQuote: vi.fn(),
  formatEthQuote: () => '0.01 ETH (up to 0.0102 ETH)',
}))
vi.mock('../../../service/executeEthPayment', () => ({
  executeEthPayment: vi.fn(),
}))

const owner = '0x1111111111111111111111111111111111111111'
const amountOut = 20_000_000n
i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderDialog = (
  overrides: Partial<Parameters<typeof EthPaymentDialog>[0]> = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onFunded = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <EthPaymentDialog
          amountOut={amountOut}
          isLoadingAmount={false}
          onFunded={onFunded}
          onOpenChange={onOpenChange}
          onRetryAmount={() => {}}
          open
          owner={owner}
          {...overrides}
        />
      </I18nProvider>
    </QueryClientProvider>,
  )
  return { onFunded, onOpenChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getEthSwapQuote).mockResolvedValue({
    amountOut,
    amountIn: 10_000_000_000_000_000n,
    maximumEth: 10_200_000_000_000_000n,
    fee: 500,
    quotedAt: Date.now(),
  })
  vi.mocked(executeEthPayment).mockResolvedValue(undefined)
})

describe('ETH checkout dialog', () => {
  it('shows the USDC destination and ETH spending cap before enabling the swap', async () => {
    renderDialog()
    expect(screen.getByText(/20 USDC/)).toBeInTheDocument()
    expect(await screen.findByText(/up to 0.0102 ETH/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Swap ETH and continue' }),
    ).toBeEnabled()
  })

  it('opens registration only after the ETH swap confirms', async () => {
    const { onFunded, onOpenChange } = renderDialog()
    const button = screen.getByRole('button', { name: 'Swap ETH and continue' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    await waitFor(() =>
      expect(executeEthPayment).toHaveBeenCalledWith(owner, amountOut),
    )
    await waitFor(() => expect(onFunded).toHaveBeenCalledOnce())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps checkout open when the wallet rejects the swap', async () => {
    vi.mocked(executeEthPayment).mockRejectedValue(new Error('User rejected'))
    const { onFunded } = renderDialog()
    const button = screen.getByRole('button', { name: 'Swap ETH and continue' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('User rejected')
    expect(onFunded).not.toHaveBeenCalled()
  })

  it('blocks payment when there is no safe route', async () => {
    vi.mocked(getEthSwapQuote).mockRejectedValue(
      new Error('No ETH to USDC swap is available'),
    )
    renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('No ETH to USDC')
    expect(
      screen.getByRole('button', { name: 'Swap ETH and continue' }),
    ).toBeDisabled()
  })

  it('uses existing account credit without making an unnecessary swap', () => {
    const { onFunded } = renderDialog({ amountOut: 0n })
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue to registration' }),
    )
    expect(onFunded).toHaveBeenCalledOnce()
    expect(executeEthPayment).not.toHaveBeenCalled()
  })
})
