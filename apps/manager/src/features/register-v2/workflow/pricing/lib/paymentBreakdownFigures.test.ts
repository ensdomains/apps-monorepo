import { describe, expect, it } from 'vitest'
import { getDurationInSecondsFromYears } from '../../../utils/time'
import {
  getAnnualFeeTerm,
  getPaymentBreakdownFigures,
} from './paymentBreakdownFigures'

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
      total: 164.32,
      leftover: 1.82,
    })
  })

  // Without a leftover the headline is the total, so it has to be the sum of
  // the rows as they are shown, not the raw figure rounded on its own.
  it('totals the rounded rows rather than rounding the raw total', () => {
    const figures = getPaymentBreakdownFigures({
      registration: 4.994,
      networkFee: 4.994,
      walletDebit: 9.988,
      hcaCredit: 0,
    })

    expect(figures.total).toBe(9.98)
    expect(figures.total).toBe(figures.registration + figures.networkFee)
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

describe('getAnnualFeeTerm', () => {
  const referenceDate = new Date('2026-10-05T00:00:00Z')

  it('multiplies back to the base price for a ten-year preset', () => {
    const term = getAnnualFeeTerm({
      basePrice: 1600,
      durationInSeconds: getDurationInSecondsFromYears(10, referenceDate),
      referenceDate,
    })

    expect(term).toEqual({ annualFee: 160, years: 10 })
  })

  it('measures a non-preset term in 365.25-day years', () => {
    const term = getAnnualFeeTerm({
      basePrice: 5,
      durationInSeconds: 28 * 24 * 60 * 60,
      referenceDate,
    })

    expect(term?.years).toBeCloseTo(28 / 365.25)
    expect((term?.annualFee ?? 0) * (term?.years ?? 0)).toBeCloseTo(5)
  })

  it('has no term for a zero duration', () => {
    expect(
      getAnnualFeeTerm({ basePrice: 5, durationInSeconds: 0, referenceDate }),
    ).toBeNull()
  })
})
