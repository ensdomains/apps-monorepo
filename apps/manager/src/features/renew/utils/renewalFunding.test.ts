import { describe, expect, it } from 'vitest'
import { computeRenewalFunding } from './renewalFunding'

describe('computeRenewalFunding', () => {
  it('deducts the account balance once and keeps the fee in the USDC share', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      price: 8,
      funded: 8.8,
      networkFee: 0.02,
      selectedToken: 'USDC',
      accountCredit: { USDC: 5 },
    })

    expect(summary.total).toBeCloseTo(8.82)
    expect(summary.walletDebit).toBeCloseTo(3.82)
    expect(summary.hcaCredit).toBe(5)
    expect(walletDebitFor('USDC')).toBeCloseTo(3.82)
  })

  it('does not charge the USDC fee against a DAI rent', () => {
    const { summary, walletDebitFor } = computeRenewalFunding({
      price: 8,
      funded: 8.8,
      networkFee: 0.02,
      selectedToken: 'DAI',
      accountCredit: {},
    })

    expect(summary.walletDebit).toBeCloseTo(8.8)
    expect(summary.total).toBeCloseTo(8.82)
    expect(walletDebitFor('DAI')).toBeCloseTo(8.8)
    expect(walletDebitFor('USDC')).toBeCloseTo(8.82)
  })
})
