import { formatUnits } from 'viem'
import { getRenewalCheckoutTotalRaw } from '@/features/renew/utils/renewalFunding'

const RECEIPT_DECIMALS = 6
const HALF_CENT_RAW = 5_000n

export type BulkRenewListFigures = Readonly<{
  /** The account's balance taken off the names, in USD; zero when it wouldn't show as a cent. */
  appliedBalance: number
  /** The list's Total, the figure the receipt's renewal total starts from. */
  listTotal: number
}>

/** The names list's footer: on the intent route its Total is the receipt's, net of the account's balance. */
export const getBulkRenewListFigures = ({
  isIntentRoute,
  fundedRaw,
  checkoutTotalRaw,
  decimals,
  grandTotal,
}: {
  readonly isIntentRoute: boolean
  readonly fundedRaw: bigint | undefined
  /** The receipt's renewal total, in USDC units. */
  readonly checkoutTotalRaw: bigint | undefined
  /** The price's coin. */
  readonly decimals: number
  /** The names' subtotals summed. */
  readonly grandTotal: number
}): BulkRenewListFigures => {
  const grossRaw = getRenewalCheckoutTotalRaw({
    fundedRaw,
    accountBalanceRaw: 0n,
    decimals,
  })
  if (
    !isIntentRoute ||
    grossRaw === undefined ||
    checkoutTotalRaw === undefined
  )
    return { appliedBalance: 0, listTotal: grandTotal }
  const appliedRaw = grossRaw - checkoutTotalRaw
  return {
    appliedBalance:
      appliedRaw >= HALF_CENT_RAW
        ? Number(formatUnits(appliedRaw, RECEIPT_DECIMALS))
        : 0,
    listTotal: Number(formatUnits(checkoutTotalRaw, RECEIPT_DECIMALS)),
  }
}
