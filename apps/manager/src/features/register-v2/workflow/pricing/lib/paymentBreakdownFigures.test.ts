import { describe, expect, it } from 'vitest'
import { getPaymentBreakdownFigures } from './paymentBreakdownFigures'

describe('getPaymentBreakdownFigures', () => {
  it('derives the leftover so the shown lines add up to the debit', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 160,
      networkFee: 4.32,
      walletDebit: 162.5,
      hcaCredit: 1.82,
    })

    expect(figures).toEqual({
      registration: 160,
      networkFee: 4.32,
      walletDebit: 162.5,
      leftover: 1.82,
    })
  })

  // Six-decimal USDC rounded line by line can land a cent off the headline;
  // the leftover takes the residue so the subtraction stays checkable.
  it('absorbs the rounding residue into the leftover', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 1.004,
      networkFee: 1.004,
      walletDebit: 1.0,
      hcaCredit: 1.008,
    })

    expect(figures.registration + figures.networkFee - figures.leftover).toBe(
      figures.walletDebit,
    )
  })

  it('shows no leftover when the HCA is empty, even if rounding would invent one', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 4.996,
      networkFee: 4.996,
      walletDebit: 9.992,
      hcaCredit: 0,
    })

    expect(figures.leftover).toBe(0)
  })

  it('shows no leftover for a balance under a cent', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 4.994,
      networkFee: 4.994,
      walletDebit: 9.987,
      hcaCredit: 0.001,
    })

    expect(figures.leftover).toBe(0)
  })
})
