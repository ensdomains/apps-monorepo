import { withBudgetDrift } from '@ens-apps/smart-account'

/**
 * USDC (6dp) a renewal paid from an L2 bridges into the HCA: the price with its
 * headroom plus the fee widened for drift, less what the HCA already holds. The
 * margin keeps the renewal's own re-quote covered; what it doesn't spend stays
 * in the HCA.
 */
export const getL2RenewalAmountOut = ({
  rentTotal,
  quotedFeeUsdc,
  hcaBalance,
}: {
  /** The price with its approval headroom, in USDC. */
  readonly rentTotal: bigint
  readonly quotedFeeUsdc: bigint
  readonly hcaBalance: bigint
}): bigint => {
  const target = rentTotal + withBudgetDrift(quotedFeeUsdc)
  return target > hcaBalance ? target - hcaBalance : 0n
}
