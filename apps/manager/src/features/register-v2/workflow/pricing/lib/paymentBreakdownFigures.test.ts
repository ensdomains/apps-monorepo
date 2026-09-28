import { describe, expect, it } from 'vitest'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import {
  getPaymentBreakdownFigures,
  type PaymentBreakdownFigures,
} from './paymentBreakdownFigures'

const expectValidDisplayedBreakdown = (figures: PaymentBreakdownFigures) => {
  expect(Object.values(figures).every((figure) => figure >= 0)).toBe(true)
  expect(
    Math.round(figures.registration * 100) +
      Math.round(figures.networkFee * 100) -
      Math.round(figures.credit * 100),
  ).toBe(Math.round(figures.walletDebit * 100))
}

describe('getPaymentBreakdownFigures', () => {
  it('keeps the lines adding up to the headline', () => {
    // Six-decimal USDC amounts that each round away from the sum: preserving
    // the visible 1.01 credit requires the displayed fee to absorb one cent.
    const figures = getPaymentBreakdownFigures({
      registration: 1.004,
      networkFee: 1.004,
      walletDebit: 1,
      hcaCredit: 1.008,
    })

    expect(figures).toEqual({
      registration: 1,
      networkFee: 1.01,
      walletDebit: 1,
      credit: 1.01,
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
        hcaCredit: 1.82,
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
        hcaCredit: 0,
      }).credit,
    ).toBe(0)
  })

  // The real credit is sub-cent even when independently rounded charges could
  // otherwise imply a negative deduction.
  it('reports no credit when the balance is under a cent', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 4.994,
        networkFee: 4.994,
        walletDebit: 9.987,
        hcaCredit: 0.001,
      }).credit,
    ).toBe(0)
  })

  it('does not derive a visible credit from a sub-cent real balance', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 4.996,
        networkFee: 4.996,
        walletDebit: 9.988,
        hcaCredit: 0.004,
      }).credit,
    ).toBe(0)
  })

  it('keeps a visible cent and reallocates the rounding residue to the fee', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 4.994,
      networkFee: 4.994,
      walletDebit: 9.978,
      hcaCredit: 0.01,
    })

    expect(figures).toEqual({
      registration: 4.99,
      networkFee: 5,
      walletDebit: 9.98,
      credit: 0.01,
    })
    expect(
      figures.registration + figures.networkFee - figures.credit,
    ).toBeCloseTo(figures.walletDebit, 10)
  })

  it('moves a residual beyond the fee into a nonnegative registration charge', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 14.277073,
      networkFee: 0.001508,
      walletDebit: 6.304178,
      hcaCredit: 7.974403,
    })

    expect(figures).toEqual({
      registration: 14.27,
      networkFee: 0,
      walletDebit: 6.3,
      credit: 7.97,
    })
    expectValidDisplayedBreakdown(figures)
  })

  it('matches formatter rounding for a half-cent fee without credit', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 1,
      networkFee: 0.145,
      walletDebit: 1.145,
      hcaCredit: 0,
    })

    expect(figures).toEqual({
      registration: 1,
      networkFee: 0.15,
      walletDebit: 1.15,
      credit: 0,
    })
    expect(formatUsd(figures.networkFee)).toBe(formatUsd(0.145))
    expectValidDisplayedBreakdown(figures)
  })

  it('matches formatter rounding and closes a half-cent credited breakdown', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 1.005,
      networkFee: 0.14,
      walletDebit: 1,
      hcaCredit: 0.145,
    })

    expect(figures).toEqual({
      registration: 1.01,
      networkFee: 0.14,
      walletDebit: 1,
      credit: 0.15,
    })
    expect(formatUsd(figures.registration)).toBe(formatUsd(1.005))
    expect(formatUsd(figures.credit)).toBe(formatUsd(0.145))
    expectValidDisplayedBreakdown(figures)
  })

  it('keeps a credit of a cent or more', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 4.994,
        networkFee: 4.994,
        walletDebit: 9.974,
        hcaCredit: 0.014,
      }).credit,
    ).toBe(0.01)
  })

  // The residue the other way: an empty account whose rounded lines leave a
  // cent over would otherwise print a credit nobody has.
  it('invents no credit for an empty account', () => {
    expect(
      getPaymentBreakdownFigures({
        registration: 4.996,
        networkFee: 4.996,
        walletDebit: 9.992,
        hcaCredit: 0,
      }).credit,
    ).toBe(0)
  })
})
