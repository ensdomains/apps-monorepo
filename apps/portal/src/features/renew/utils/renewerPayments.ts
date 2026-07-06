import type { Address } from 'viem'
import type {
  MultiRenewalEntry,
  RenewerPayment,
} from '../hooks/useRenewalTransactions'
import { getRenewerAddress } from './renewer'

// One name's contribution to a batch's approvals: which renewer (ERC-20 spender)
// must be paid, and how much it owes for this name in the chosen token.
export type RenewerCharge = {
  readonly renewer: Address
  readonly total: bigint
}

/**
 * Distinct renewer contracts among a batch's names, in first-seen order — the
 * ERC-20 spenders the flow must price against and read allowances for. A
 * same-kind batch yields one; a mixed v1+v2 batch yields two.
 */
export const distinctRenewers = (
  renewals: readonly MultiRenewalEntry[],
): Address[] => {
  const seen = new Set<Address>()
  for (const renewal of renewals) {
    seen.add(getRenewerAddress(renewal.selectedName.isV2))
  }
  return [...seen]
}

/**
 * Collapse per-name charges into one `RenewerPayment` per distinct renewer:
 * summing each renewer's owed total and attaching its current allowance. A
 * same-kind batch yields one payment; a mixed v1+v2 batch yields two (one per
 * renewer contract), which drives the flow's per-spender approval step(s).
 * Renewers appear in first-seen order.
 */
export const computeRenewerPayments = (
  charges: readonly RenewerCharge[],
  allowanceByRenewer: (renewer: Address) => bigint,
): RenewerPayment[] => {
  const totals = new Map<Address, bigint>()
  for (const { renewer, total } of charges) {
    totals.set(renewer, (totals.get(renewer) ?? 0n) + total)
  }
  return [...totals].map(([renewer, total]) => ({
    renewer,
    total,
    allowance: allowanceByRenewer(renewer),
  }))
}
