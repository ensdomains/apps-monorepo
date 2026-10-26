import type { L2Wallet } from '../../../data/queries/l2Balances.query'

/** The one-off Permit2 approval is still needed for `amountRaw` on this L2. */
export const needsPermit2Approval = (
  wallet: L2Wallet | null | undefined,
  amountRaw: bigint | null | undefined,
): boolean => !!wallet && !!amountRaw && wallet.permit2Allowance < amountRaw

/** Needs the approval and can't pay its gas. An unread state never blocks. */
export const isShortOfApprovalGas = (
  wallet: L2Wallet | null | undefined,
  amountRaw: bigint | null | undefined,
  approvalCost: bigint | null | undefined,
): boolean =>
  !!wallet &&
  needsPermit2Approval(wallet, amountRaw) &&
  approvalCost !== null &&
  approvalCost !== undefined &&
  wallet.eth < approvalCost
