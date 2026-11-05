import { roundUsdToCents } from '@/utils/formatting/formatUsdCeil'
import { getPaymentBreakdownFigures } from './paymentBreakdownFigures'

export type PaymentReceiptFigures = {
  readonly total: number
  readonly applied: number
  readonly due: number
}

/** `usd` rounded up to a whole cent, read through micro-dollars so float noise can't add one. */
const ceilUsdToCents = (usd: number): number =>
  Math.ceil(Math.round(usd * 1_000_000) / 10_000) / 100

/** The receipt's three figures, in cents, so total minus applied always equals due. */
export const getPaymentReceiptFigures = ({
  funding,
  price,
  accountCredit,
  isUpTo = false,
}: {
  readonly funding:
    | {
        readonly registration: number
        readonly networkFee: number
        readonly walletDebit: number
        readonly hcaCredit: number
      }
    | undefined
  readonly price: number | undefined
  readonly accountCredit: number
  /** The figures are maximums ("up to"): what the wallet pays rounds up, never below what it signs. */
  readonly isUpTo?: boolean
}): PaymentReceiptFigures | undefined => {
  if (funding) {
    const { walletDebit, credit } = getPaymentBreakdownFigures(funding)
    const due = isUpTo ? ceilUsdToCents(funding.walletDebit) : walletDebit
    return { total: roundUsdToCents(due + credit), applied: credit, due }
  }
  if (price === undefined) return undefined
  const total = isUpTo ? ceilUsdToCents(price) : roundUsdToCents(price)
  const applied = roundUsdToCents(Math.min(Math.max(0, accountCredit), total))
  return { total, applied, due: roundUsdToCents(total - applied) }
}

export type PaymentReceiptState =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly figures: PaymentReceiptFigures }

/** Failed quotes show a full estimate or dashes, never the registration price alone. */
export const getPaymentReceiptState = ({
  hasQuoteFailed,
  isLoading,
  figures,
}: {
  readonly hasQuoteFailed: boolean
  readonly isLoading: boolean
  readonly figures: PaymentReceiptFigures | undefined
}): PaymentReceiptState => {
  if (hasQuoteFailed) {
    return figures ? { status: 'ready', figures } : { status: 'unavailable' }
  }
  if (isLoading) return { status: 'loading' }
  return figures ? { status: 'ready', figures } : { status: 'unavailable' }
}

/** On quote failure, only a full fee estimate may appear on the receipt. */
export const getCheckoutReceiptFigures = ({
  hasBudgetQuoteFailed,
  funding,
  price,
  accountCredit,
  isUpTo = false,
}: {
  readonly hasBudgetQuoteFailed: boolean
  readonly funding:
    | {
        readonly registration: number
        readonly networkFee: number
        readonly walletDebit: number
        readonly hcaCredit: number
      }
    | undefined
  readonly price: number | undefined
  readonly accountCredit: number
  readonly isUpTo?: boolean
}): PaymentReceiptFigures | undefined => {
  if (hasBudgetQuoteFailed) {
    return funding
      ? getPaymentReceiptFigures({
          funding,
          price: undefined,
          accountCredit: 0,
        })
      : undefined
  }
  return getPaymentReceiptFigures({
    funding,
    price,
    accountCredit,
    isUpTo,
  })
}

const MICROS_PER_CENT = 10_000
const toMicros = (usd: number) => Math.round(usd * 1_000_000)

/**
 * What the wallet is short by, from the due amount as displayed, so the two agree.
 * A gap hidden by that rounding still reads as one cent rather than nothing.
 */
export const getWalletShortfall = (
  required: number | undefined,
  balance: number | undefined,
) => {
  if (required === undefined || balance === undefined) return undefined
  const shownGap = toMicros(roundUsdToCents(required)) - toMicros(balance)
  if (shownGap > 0) return Math.ceil(shownGap / MICROS_PER_CENT) / 100
  return toMicros(required) > toMicros(balance) ? 0.01 : undefined
}

/** One cent in USDC's 6 decimals. */
const CENT_RAW = 10_000n

/** Half-up to a whole cent, as `formatUsd` shows it. */
const roundToCentRaw = (raw: bigint): bigint =>
  ((raw + CENT_RAW / 2n) / CENT_RAW) * CENT_RAW

/** What the wallet pays with ETH: the most the swap sends plus its gas, in USDC (6dp), to the cent. */
export const getEthReceiptDueRaw = (
  ethDebitRaw: bigint,
  extraFeeRaw: bigint,
): bigint => roundToCentRaw(ethDebitRaw + extraFeeRaw)

/** All in USDC's 6 decimals, rounded to cents. */
export type NetworkFeeReceiptFigures = {
  readonly registrationTotalRaw: bigint
  readonly networkFeeRaw: bigint
  /** The existing balance left after the name cost, applied to the fee; zero when none is left. */
  readonly existingBalanceRaw: bigint
  readonly dueRaw: bigint
}

/** The registration sheet's receipt: page total, the method's full fee, leftover balance, and what is due. */
export const getNetworkFeeReceiptFigures = ({
  registrationTotalRaw,
  networkFeeRaw,
  walletDebitRaw,
  extraFeeRaw = 0n,
}: {
  readonly registrationTotalRaw: bigint
  /** The selected method's fee, before any existing balance. */
  readonly networkFeeRaw: bigint
  readonly walletDebitRaw: bigint
  /** Paid on top of the wallet debit, such as an ETH swap's gas. */
  readonly extraFeeRaw?: bigint
}): NetworkFeeReceiptFigures => {
  const total = roundToCentRaw(registrationTotalRaw)
  const due = roundToCentRaw(walletDebitRaw + extraFeeRaw)
  const fee = roundToCentRaw(networkFeeRaw + extraFeeRaw)
  const existingBalance = total + fee - due
  // A cent of rounding either way goes to the fee: no balance line without a real balance.
  return existingBalance <= CENT_RAW
    ? {
        registrationTotalRaw: total,
        networkFeeRaw: due > total ? due - total : 0n,
        existingBalanceRaw: 0n,
        dueRaw: due,
      }
    : {
        registrationTotalRaw: total,
        networkFeeRaw: fee,
        existingBalanceRaw: existingBalance,
        dueRaw: due,
      }
}
