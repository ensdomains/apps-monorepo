import { useQuery } from '@tanstack/react-query'
import { getEthPaymentQuoteQueryOptions } from '@/features/register-v2/data/queries/ethPaymentQuote.query'
import type { EthPaymentProps } from '@/features/register-v2/workflow/pricing/components/EthPaymentListItem'
import { getEthPaymentRow } from '@/features/register-v2/workflow/pricing/lib/ethPaymentRow'
import { getL2RenewalAmountOut } from '@/features/renew/utils/l2RenewalAmount'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'

export type RenewalEthPayment = EthPaymentProps &
  Readonly<{
    /** USDC (6dp) the swap buys toward, sized as an L2 payment is; `undefined` until priced. */
    usdcAmount: bigint | undefined
  }>

/** A renewal's ETH row: the wallet's ETH swapped for the USDC the account is short. */
export const useRenewalEthPayment = ({
  rentTotalRaw,
  feeRaw,
  hcaBalanceRaw,
  isEnabled,
  isSelected,
  onSelect,
  onFallbackSelect,
}: {
  /** The USDC price with its approval headroom, once priced. */
  readonly rentTotalRaw: bigint | undefined
  /** The intents' quoted fee in USDC. */
  readonly feeRaw: bigint | undefined
  readonly hcaBalanceRaw: bigint | undefined
  /** Intent route only: the swapped USDC funds the account's permit. */
  readonly isEnabled: boolean
  readonly isSelected: boolean
  readonly onSelect: () => void
  readonly onFallbackSelect: () => void
}): RenewalEthPayment | undefined => {
  const { ownerAddress } = useSmartAccountContext()
  const usdcAmount =
    rentTotalRaw === undefined || feeRaw === undefined
      ? undefined
      : getL2RenewalAmountOut({
          rentTotal: rentTotalRaw,
          quotedFeeUsdc: feeRaw,
          hcaBalance: hcaBalanceRaw ?? 0n,
        })
  const quote = useQuery(
    getEthPaymentQuoteQueryOptions({
      owner: ownerAddress,
      permitValue: usdcAmount,
      isEnabled,
    }),
  )
  return isEnabled
    ? {
        row: getEthPaymentRow(quote, usdcAmount),
        isSelected,
        onSelect,
        onFallbackSelect,
        usdcAmount,
      }
    : undefined
}
