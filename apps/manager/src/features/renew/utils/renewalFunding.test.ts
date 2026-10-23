import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from '@/features/shared/payment/utils/paymentBreakdownFigures'
import { computeRenewalFunding } from './renewalFunding'

describe('computeRenewalFunding', () => {
  it('deducts the account balance once and keeps the headroom out of the displayed fee', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      funded: 8800000n,
      networkFee: 20000n,
      selectedToken: 'USDC',
      accountCredit: { USDC: 5000000n },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(3.82)
    expect(summary.hcaCredit).toBe(5)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
    expect(getPaymentBreakdownFigures(summary).networkFee).toBeCloseTo(0.02)
  })

  it('bills a DAI rent in DAI and the fee in USDC, each against its own credit', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      funded: 8800000000000000000n,
      networkFee: 20000n,
      selectedToken: 'DAI',
      accountCredit: { USDC: 5000000n },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(8.8)
    expect(summary.hcaCredit).toBeCloseTo(0.02)
    expect(walletDebitFor('DAI')).toBeCloseTo(8.8)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
  })
  it('derives the displayed receipt and consent ceiling from the same sub-cent debit', () => {
    const funding = computeRenewalFunding({
      funded: 8800000n,
      networkFee: 20001n,
      selectedToken: 'USDC',
      accountCredit: { USDC: 5000000n },
    })
    expect(funding.displayedWalletDebitUsdc).toBe(3830000n)
    expect(funding.summary.walletDebit).toBe(3.83)
    expect(funding.walletDebitFor('USDC')).toBe(3.820001)
  })
})
