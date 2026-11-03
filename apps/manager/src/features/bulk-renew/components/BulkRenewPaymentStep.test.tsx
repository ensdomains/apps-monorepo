import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StablecoinBalance } from '@/lib/smart-account'
import { render } from '@/utils/test-utils'
import type { UseBulkRenewResult } from '../hooks/useBulkRenew'
import { BulkRenewPaymentStep } from './BulkRenewPaymentStep'

const coin = (symbol: 'USDC' | 'DAI', balance: string, decimals: number) =>
  ({
    address: symbol === 'USDC' ? '0x01' : '0x02',
    symbol,
    decimals,
    balance,
  }) as unknown as StablecoinBalance

const payment: UseBulkRenewResult['payment'] = {
  isConnected: true,
  isLoadingBalances: false,
  // 100 USDC covers it; the DAI wallet is empty.
  stablecoinBalances: [coin('USDC', '100000000', 6), coin('DAI', '0', 18)],
  accountCredit: {},
  fundedTotal: 22,
  canProceed: true,
  pricesReady: true,
  intentFunding: {
    isIntentRoute: true,
    isQuoting: false,
    funding: {
      registration: 22,
      networkFee: 0.3,
      total: 22.3,
      walletDebit: 22.3,
      hcaCredit: 0,
      isLoading: false,
    },
    walletDebitFor: (symbol) => (symbol === 'USDC' ? 22.3 : 22),
    feeRaw: 300_000n,
  },
  l2Payment: undefined,
  selectedL2: undefined,
}

describe('BulkRenewPaymentStep', () => {
  it('pays for the names through the same picker and receipt as single renewal', () => {
    const onConfirm = vi.fn()
    render(
      <BulkRenewPaymentStep
        grandTotal={20}
        header={<p>3 names</p>}
        onConfirm={onConfirm}
        onSelectCoin={() => {}}
        payment={payment}
        selectedToken="USDC"
      />,
    )

    expect(screen.getByText('3 names')).toBeVisible()
    // The fee is shown with the method, and the total carries it.
    expect(screen.getByText(/est\. fee: \$0\.30/)).toBeVisible()
    expect(screen.getByText('$22.30')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /DAI/ }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continue in wallet' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
