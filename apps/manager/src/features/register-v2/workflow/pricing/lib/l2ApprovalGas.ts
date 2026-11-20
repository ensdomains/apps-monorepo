/** The quote takes an onchain approval the wallet lacks the ETH for. An unread state never blocks. */
export const isShortOfApprovalGas = (
  quote: Readonly<{ needsOnchainApproval: boolean }> | undefined,
  eth: bigint | undefined,
  approvalCost: bigint | null | undefined,
): boolean =>
  !!quote?.needsOnchainApproval &&
  eth !== undefined &&
  approvalCost != null &&
  eth < approvalCost
