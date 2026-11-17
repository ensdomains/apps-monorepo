/** How a primary-name update pays: the HCA intent in USDC, or the owner's own transactions in ETH. */
export type PrimaryNamePayment = 'usdc' | 'eth'

export interface PrimaryNamePaymentInputs {
  /** USDC (6dp) the HCA holds. */
  readonly hcaUsdc: bigint
  /** USDC (6dp) the owner's wallet holds, which can fund the HCA's shortfall; `null` when unread. */
  readonly walletUsdc: bigint | null
  /** The intent's USDC fee, or `null` when it was not or could not be quoted. */
  readonly feeUsdc: bigint | null
  /** Wei the owner's wallet holds; `null` when unread. */
  readonly walletEth: bigint | null
  /** Wei the direct transactions are estimated to cost, or `null` when unknown. */
  readonly ethCost: bigint | null
}

/** USDC by default; ETH when only ETH can pay. With neither, USDC runs so its funding error shows. */
export const selectPrimaryNamePayment = ({
  hcaUsdc,
  walletUsdc,
  feeUsdc,
  walletEth,
  ethCost,
}: PrimaryNamePaymentInputs): PrimaryNamePayment => {
  const isUsdcEnough =
    feeUsdc !== null && hcaUsdc + (walletUsdc ?? 0n) >= feeUsdc
  const isEthEnough =
    ethCost !== null && walletEth !== null && walletEth >= ethCost
  return !isUsdcEnough && isEthEnough ? 'eth' : 'usdc'
}
