/**
 * Pure builder that turns the user's transfer options into an ordered list of
 * on-chain steps.
 *
 * Ordering matters: every configuration step (reset the resolver, reset the
 * registry) must run BEFORE the ownership hand-off, because once the ERC-1155
 * token is transferred the sender loses the roles needed to make those changes.
 * The token transfer is therefore always last.
 *
 * Both config steps are "reset to zero" rather than "hand over a fresh
 * contract": in v2 the resolver and the subregistry are user-owned objects that
 * may be shared across the sender's other names, so we detach the name from them
 * (`setResolver(0x0)` / `setSubregistry(0x0)`) instead of reassigning them to the
 * recipient. The recipient deploys their own afterwards.
 */

export type TransferOptions = {
  /** Detach the name from its resolver (`setResolver(0x0)`) for a clean slate. */
  readonly resetResolver: boolean
  /** Detach the name from its subregistry (`setSubregistry(0x0)`). */
  readonly resetRegistry: boolean
}

export type TransferStepKind =
  | 'reset-resolver'
  | 'reset-registry'
  | 'transfer-token'

/**
 * Build the ordered step list for a transfer. The `transfer-token` step is
 * always present and always last.
 */
export const buildTransferPlan = (
  options: TransferOptions,
): TransferStepKind[] => {
  const steps: TransferStepKind[] = []

  // Configuration steps run before the token moves, since the sender loses the
  // required roles once ownership transfers.
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
  'reset-resolver': 'Reset resolver',
  'reset-registry': 'Reset registry',
  'transfer-token': 'Transfer name',
}
