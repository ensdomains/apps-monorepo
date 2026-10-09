import { roundUsdToCents } from '@/utils/formatting/formatUsdCeil'

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
 * of the breakdown is that the subtraction is checkable, the rounded wallet
 * debit and authoritative credit stay fixed while the network-fee presentation
 * absorbs any rounding residue. If that would make the fee negative, it is
 * floored at zero and the remainder moves to registration instead. Callers use
 * the adjusted figures everywhere they are shown.
 *
 * The residue cuts both ways, so `hcaCredit` supplies a displayed credit only
 * when it itself rounds to a visible cent. An independent rounding residue must
 * not invent credit for an empty or sub-cent account; those come back as zero,
 * and the sheet shows the plain total instead.
 */
export const getPaymentBreakdownFigures = (funding: {
  readonly registration: number
  readonly networkFee: number
  readonly walletDebit: number
  /** The account's real balance: it must itself be visible at cent precision. */
  readonly hcaCredit: number
}): PaymentBreakdownFigures => {
  const registration = roundUsdToCents(funding.registration)
  const networkFee = roundUsdToCents(funding.networkFee)
  const walletDebit = roundUsdToCents(funding.walletDebit)
  const credit = Math.max(0, roundUsdToCents(funding.hcaCredit))

  if (credit === 0) {
    return { registration, networkFee, walletDebit, credit }
  }

  const roundingResidual = roundUsdToCents(
    walletDebit + credit - registration - networkFee,
  )
  const adjustedNetworkFee = roundUsdToCents(networkFee + roundingResidual)

  if (adjustedNetworkFee < 0) {
    return {
      registration: Math.max(0, roundUsdToCents(walletDebit + credit)),
      networkFee: 0,
      walletDebit,
      credit,
    }
  }

  return {
    registration,
    networkFee: adjustedNetworkFee,
    walletDebit,
    credit,
  }
}
