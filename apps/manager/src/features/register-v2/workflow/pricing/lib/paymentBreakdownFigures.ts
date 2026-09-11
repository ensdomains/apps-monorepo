/** Round to cents, the precision every figure on the sheet is shown at. */
const toCents = (value: number) => Math.round(value * 100) / 100

export type PaymentBreakdownFigures = {
  readonly registration: number
  readonly networkFee: number
  readonly walletDebit: number
  /** What the ENS account covers, as the displayed lines imply it. */
  readonly credit: number
}

/**
 * The breakdown as it is shown, in cents.
 *
 * USDC carries six decimals, so rounding each figure on its own can leave the
 * lines a cent short of the headline (registration 1.004 + fee 1.004 - credit
 * 1.008 renders as 1.00 + 1.00 - 1.01 against a 1.00 debit). Since the point
 * of the breakdown is that the subtraction is checkable, the credit is derived
 * from the other three once they are rounded and absorbs the residue: those
 * three are amounts the user can compare against their wallet, the credit is
 * the app's own bookkeeping.
 */
export const getPaymentBreakdownFigures = (funding: {
  readonly registration: number
  readonly networkFee: number
  readonly walletDebit: number
}): PaymentBreakdownFigures => {
  const registration = toCents(funding.registration)
  const networkFee = toCents(funding.networkFee)
  const walletDebit = toCents(funding.walletDebit)

  return {
    registration,
    networkFee,
    walletDebit,
    credit: toCents(registration + networkFee - walletDebit),
  }
}
