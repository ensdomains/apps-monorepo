import type { L2ApprovalGas } from '../../../data/queries/l2ApprovalGas.query'

/** Paying needs the one-off Permit2 approval, and the wallet can't pay its gas. An unread state never blocks. */
export const isShortOfApprovalGas = (
  gas: L2ApprovalGas | null | undefined,
  amountRaw: bigint | null | undefined,
): boolean =>
  !!gas &&
  amountRaw !== null &&
  amountRaw !== undefined &&
  amountRaw > 0n &&
  gas.allowance < amountRaw &&
  gas.ethBalance < gas.approvalCost
