/** Round to cents, the precision every figure on the sheet is shown at. */
const toCents = (value: number) => Math.round(value * 100) / 100

export type PaymentBreakdownFigures = {
  readonly registration: number
  readonly networkFee: number
  readonly walletDebit: number
  /**
   * What the ENS account covers, as the displayed lines imply it. Zero for a
   * sub-cent balance, which has no honest line to render: callers show the
   * plain total in that case.
   */
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
 *
 * A balance under a cent cannot be shown at all without breaking that: the
 * residue can drive the derived credit to zero or below (4.994 + 4.994 against
 * a 9.987 debit gives -0.01). It comes back as zero, and the sheet leaves the
 * credit off rather than printing a negative deduction.
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
    credit: Math.max(0, toCents(registration + networkFee - walletDebit)),
  }
}
