/**
 * Pure builder that turns the user's transfer options into an ordered list of
 * on-chain steps. The token transfer is always last.
 *
 * EOA sequences are not atomic — there is no rollback if the user abandons
 * mid-flow. That is inherent to the whole transfer feature, not unique to
 * unset-primary.
 *
 * Ordering defense:
 * 1. Resolver/registry resets (`setResolver(0x0)` / `setSubregistry(0x0)`) MUST
 *    run before the transfer: once the ERC-1155 token moves, the sender loses
 *    the roles needed to make those changes. These are "reset to zero" rather
 *    than handing over a fresh contract — in v2 the resolver and subregistry
 *    may be shared across the sender's other names, so we detach this name from
 *    them; the recipient deploys their own afterwards.
 * 2. Unset-primary (L1 `default.reverse` / `addr.reverse`) COULD run after the
 *    transfer — reverse records stay under the sender's authority forever —
 *    but running it last recreates the stale-reverse-record bug whenever a user
 *    abandons after the transfer step. Clearing first fails toward the
 *    recoverable state (re-set primary = one tx) instead of the bug state.
 *    Each matching registrar is its own modal step / wallet confirmation.
 */

import type { UnsetPrimaryTargets } from '../helpers/unsetPrimaryName'

export type TransferOptions = {
  /** Detach the name from its resolver (`setResolver(0x0)`) for a clean slate. */
  readonly resetResolver: boolean
  /** Detach the name from its subregistry (`setSubregistry(0x0)`). */
  readonly resetRegistry: boolean
}

export type TransferStepKind =
  | 'unset-default-reverse'
  | 'unset-addr-reverse'
  | 'reset-resolver'
  | 'reset-registry'
  | 'transfer-token'

/**
 * Build the ordered step list for a transfer. The `transfer-token` step is
 * always present and always last.
 *
 * `unsetTargets` comes from L1 reverse discovery — each matching registrar is a
 * separate modal step / wallet confirmation.
 */
export const buildTransferPlan = (
  options: TransferOptions,
  unsetTargets: UnsetPrimaryTargets,
): TransferStepKind[] => {
  const steps: TransferStepKind[] = []

  // Configuration steps run before the token moves, since the sender loses the
  // required roles once ownership transfers.
  if (unsetTargets.clearDefault) {
    steps.push('unset-default-reverse')
  }

  if (unsetTargets.clearReverse) {
    steps.push('unset-addr-reverse')
  }

  if (options.resetResolver) {
    steps.push('reset-resolver')
  }

  if (options.resetRegistry) {
    steps.push('reset-registry')
  }

  steps.push('transfer-token')

  return steps
}

export const STEP_LABELS: Record<TransferStepKind, string> = {
  'unset-default-reverse': 'Unset default primary name',
  'unset-addr-reverse': 'Unset ETH primary name',
  'reset-resolver': 'Reset resolver',
  'reset-registry': 'Reset registry',
  'transfer-token': 'Transfer name',
}
