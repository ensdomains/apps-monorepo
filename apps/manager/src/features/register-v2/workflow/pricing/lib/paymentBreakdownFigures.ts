/** Round to cents, the precision every figure on the sheet is shown at. */
const toCents = (value: number) => Math.round(value * 100) / 100

export type PaymentBreakdownFigures = {
  readonly registration: number
  readonly networkFee: number
  readonly walletDebit: number
  /**
   * What the ENS account covers, as the displayed lines imply it. Zero when
   * the account is empty or holds under a cent, neither of which has an honest
   * line to render: callers show the plain total in that case.
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
 * The residue cuts both ways, so `hcaCredit` must itself round to a visible
 * cent before the derived figure says how that credit is shown. Without that,
 * an empty account invents one (4.996 + 4.996 against a 9.992 debit leaves
 * 0.01), while a sub-cent balance can invent the same visible cent or produce
 * a negative deduction. All come back as zero, and the sheet shows the plain
 * total instead.
 */
export const getPaymentBreakdownFigures = (funding: {
  readonly registration: number
  readonly networkFee: number
  readonly walletDebit: number
  /** The account's real balance: it must itself be visible at cent precision. */
  readonly hcaCredit: number
}): PaymentBreakdownFigures => {
  const registration = toCents(funding.registration)
  const networkFee = toCents(funding.networkFee)
  const walletDebit = toCents(funding.walletDebit)

  return {
    registration,
    networkFee,
    walletDebit,
    credit:
      toCents(funding.hcaCredit) > 0
        ? Math.max(0, toCents(registration + networkFee - walletDebit))
        : 0,
  }
}
