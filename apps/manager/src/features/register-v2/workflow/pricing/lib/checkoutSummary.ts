/** What the registration page asks for, in USDC (6 decimals). */
export type CheckoutSummary = Readonly<{
  nameCostRaw: bigint
  /** The account's existing balance, applied up to the name cost. */
  existingBalanceRaw: bigint
  totalRaw: bigint
}>

export const getCheckoutSummary = (
  nameCostRaw: bigint,
  accountBalanceRaw: bigint,
): CheckoutSummary => {
  const existingBalanceRaw =
    accountBalanceRaw < nameCostRaw ? accountBalanceRaw : nameCostRaw
  return {
    nameCostRaw,
    existingBalanceRaw,
    totalRaw: nameCostRaw - existingBalanceRaw,
  }
}
