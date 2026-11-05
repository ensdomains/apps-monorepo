import { formatUnits, parseUnits } from 'viem'
import { getCheckoutSummary } from '@/features/register-v2/workflow/pricing/lib/checkoutSummary'

export type BulkRenewListFigures = Readonly<{
  /** The account's balance taken off the names, in USD; zero when it wouldn't show as a cent. */
  appliedBalance: number
  /** The list's Total, as the receipt's renewal total; `undefined` while the price or balance loads. */
  listTotal: number | undefined
}>

/** The names list's footer: on the intent route, the page card's figures for the whole selection. */
export const getBulkRenewListFigures = ({
  isIntentRoute,
  priceRaw,
  accountBalanceRaw,
  decimals,
  grandTotal,
}: {
  readonly isIntentRoute: boolean
  /** The selection's summed price, once every name is priced. */
  readonly priceRaw: bigint | undefined
  /** The account's balance of the price's coin, once read. */
  readonly accountBalanceRaw: bigint | undefined
  /** The price's coin. */
  readonly decimals: number
  /** The names' subtotals summed. */
  readonly grandTotal: number
}): BulkRenewListFigures => {
  if (!isIntentRoute) return { appliedBalance: 0, listTotal: grandTotal }
  if (priceRaw === undefined || accountBalanceRaw === undefined)
    return { appliedBalance: 0, listTotal: undefined }
  const { existingBalanceRaw, totalRaw } = getCheckoutSummary(
    priceRaw,
    accountBalanceRaw,
  )
  return {
    appliedBalance:
      existingBalanceRaw >= parseUnits('0.005', decimals)
        ? Number(formatUnits(existingBalanceRaw, decimals))
        : 0,
    listTotal: Number(formatUnits(totalRaw, decimals)),
  }
}
