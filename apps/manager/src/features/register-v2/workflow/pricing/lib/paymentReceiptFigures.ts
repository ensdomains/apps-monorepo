import { roundUsdToCents } from '@/utils/formatting/formatUsdCeil'
import { getPaymentBreakdownFigures } from './paymentBreakdownFigures'

export type PaymentReceiptFigures = {
  readonly total: number
  readonly applied: number
  readonly due: number
}

/** The receipt's three figures, in cents, so total minus applied always equals due. */
export const getPaymentReceiptFigures = ({
  funding,
  price,
  accountCredit,
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
}): PaymentReceiptFigures | undefined => {
  if (funding) {
    const { walletDebit, credit } = getPaymentBreakdownFigures(funding)
    return {
      total: roundUsdToCents(walletDebit + credit),
      applied: credit,
      due: walletDebit,
    }
  }
  if (price === undefined) return undefined
  const total = roundUsdToCents(price)
  const applied = roundUsdToCents(Math.min(Math.max(0, accountCredit), total))
  return { total, applied, due: roundUsdToCents(total - applied) }
}

export type PaymentReceiptState =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly figures: PaymentReceiptFigures }

/** A failed quote shows dashes, never a stale or partial figure. */
export const getPaymentReceiptState = ({
  hasQuoteFailed,
  isLoading,
  figures,
}: {
  readonly hasQuoteFailed: boolean
  readonly isLoading: boolean
  readonly figures: PaymentReceiptFigures | undefined
}): PaymentReceiptState => {
  if (hasQuoteFailed) return { status: 'unavailable' }
  if (isLoading) return { status: 'loading' }
  return figures ? { status: 'ready', figures } : { status: 'unavailable' }
}

const MICROS_PER_CENT = 10_000
const toMicros = (usd: number) => Math.round(usd * 1_000_000)

/** What the wallet is short by, in 6dp units rounded up to the cent, so float error never adds a cent. */
export const getWalletShortfall = (
  required: number | undefined,
  balance: number | undefined,
) => {
  if (required === undefined || balance === undefined) return undefined
  const micros = toMicros(required) - toMicros(balance)
  return micros > 0 ? Math.ceil(micros / MICROS_PER_CENT) / 100 : undefined
}
