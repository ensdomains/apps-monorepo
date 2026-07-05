/**
 * Pure builder that turns the user's transfer options into an ordered list of
 * on-chain steps.
 *
 * Ordering matters: every configuration step (reset the resolver, deploy / point
 * a new registry) must run BEFORE the ownership hand-off, because once the
 * ERC-1155 token is transferred the sender loses the roles needed to make those
 * changes. The token transfer is therefore always last.
 */

export type TransferOptions = {
  /** Detach the name from its resolver (`setResolver(0x0)`) for a clean slate. */
  readonly resetResolver: boolean
  /** Deploy a fresh subregistry (admin = recipient) and point the name at it. */
  readonly deployRegistry: boolean
}

export type TransferStepKind =
  | 'reset-resolver'
  | 'deploy-registry'
  | 'set-registry'
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

  if (options.deployRegistry) {
    steps.push('deploy-registry', 'set-registry')
  }

  steps.push('transfer-token')

  return steps
}

const STEP_LABELS: Record<TransferStepKind, string> = {
  'reset-resolver': 'Reset resolver',
  'deploy-registry': 'Deploy new registry',
  'set-registry': 'Set registry',
  'transfer-token': 'Transfer name',
}

export const getTransferStepLabel = (kind: TransferStepKind): string =>
  STEP_LABELS[kind]
