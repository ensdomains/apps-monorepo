import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from '@/features/register-v2/workflow/pricing/lib/paymentBreakdownFigures'
import { computeRenewalFunding } from './renewalFunding'

describe('computeRenewalFunding', () => {
  it('deducts the account balance once and keeps the headroom out of the displayed fee', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      funded: 8.8,
      networkFee: 0.02,
      selectedToken: 'USDC',
      accountCredit: { USDC: 5 },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(3.82)
    expect(summary.hcaCredit).toBe(5)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
    expect(getPaymentBreakdownFigures(summary).networkFee).toBeCloseTo(0.02)
  })

  it('bills a DAI rent in DAI and the fee in USDC, each against its own credit', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      funded: 8.8,
      networkFee: 0.02,
      selectedToken: 'DAI',
      accountCredit: { USDC: 5 },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(8.8)
    expect(summary.hcaCredit).toBeCloseTo(0.02)
    expect(walletDebitFor('DAI')).toBeCloseTo(8.8)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
  })
})
