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

/** The page's total, once the name is priced and the account's balance read. */
export const getCheckoutTotalRaw = (
  nameCostRaw: bigint | undefined,
  accountBalanceRaw: bigint | undefined,
): bigint | undefined =>
  nameCostRaw === undefined || accountBalanceRaw === undefined
    ? undefined
    : getCheckoutSummary(nameCostRaw, accountBalanceRaw).totalRaw
