import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from './paymentBreakdownFigures'

describe('getPaymentBreakdownFigures', () => {
  it('keeps the lines adding up to the headline', () => {
    // Six-decimal USDC amounts that each round away from the sum: the credit
    // is 1.008 exactly, but showing it as -1.01 would leave 1.00 + 1.00 - 1.01
    // against a 1.00 debit.
    const figures = getPaymentBreakdownFigures({
      registration: 1.004,
      networkFee: 1.004,
      walletDebit: 1,
    })

    expect(figures).toEqual({
      registration: 1,
      networkFee: 1,
      walletDebit: 1,
      credit: 1,
    })
    expect(
      figures.registration + figures.networkFee - figures.credit,
    ).toBeCloseTo(figures.walletDebit, 10)
  })

  it('leaves exact amounts alone', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 160,
        networkFee: 4.32,
        walletDebit: 162.5,
      }),
    ).toEqual({
      registration: 160,
      networkFee: 4.32,
      walletDebit: 162.5,
      credit: 1.82,
    })
  })

  it('reports no credit when the wallet pays the whole breakdown', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 160,
        networkFee: 4.32,
        walletDebit: 164.32,
      }).credit,
    ).toBe(0)
  })

  // Rounding the three figures can drive the derived credit below zero, and a
  // negative deduction would render as "--$0.01" for money the account holds.
  it('reports no credit when the balance is under a cent', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 4.994,
        networkFee: 4.994,
        walletDebit: 9.987,
      }).credit,
    ).toBe(0)
  })

  it('keeps a credit of a cent or more', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 4.994,
        networkFee: 4.994,
        walletDebit: 9.974,
      }).credit,
    ).toBe(0.01)
  })
})
