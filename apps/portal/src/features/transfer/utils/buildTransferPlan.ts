/**
 * Pure builder that turns the user's transfer options into an ordered list of
 * on-chain steps.
 *
 * Ordering matters: every configuration step (unset primary, reset the
 * resolver, reset the registry) must run BEFORE the ownership hand-off, because
 * once the ERC-1155 token is transferred the sender loses the roles needed to
 * make those changes. The token transfer is therefore always last.
 *
 * Unset-primary writes are independent of token ownership (they clear the
 * sender's reverse records), but still run first so reverse-resolution for the
 * sender is cleared before the name leaves their control. Each registrar that
 * holds the name is its own modal step — one wallet confirmation per tx.
 *
 * Resolver/registry resets are "reset to zero" rather than "hand over a fresh
 * contract": in v2 the resolver and the subregistry are user-owned objects that
 * may be shared across the sender's other names, so we detach the name from them
 * (`setResolver(0x0)` / `setSubregistry(0x0)`) instead of reassigning them to the
 * recipient. The recipient deploys their own afterwards.
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
