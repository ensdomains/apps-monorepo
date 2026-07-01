/**
 * Pure builder that turns the user's transfer options into an ordered list of
 * on-chain steps.
 *
 * Ordering matters: every configuration step (deploy/point a new resolver or
 * registry) must run BEFORE the ownership hand-off, because once the ERC-1155
 * token is transferred the sender loses the roles needed to make those changes.
 * The token transfer is therefore always last.
 */

export type TransferOptions = {
  /** Deploy a fresh dedicated resolver (admin = recipient) and point the name at it. */
  readonly deployResolver: boolean
  /** Deploy a fresh subregistry (admin = recipient) and point the name at it. */
  readonly deployRegistry: boolean
}

export type TransferStepKind =
  | 'deploy-resolver'
  | 'set-resolver'
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

  if (options.deployResolver) {
    steps.push('deploy-resolver', 'set-resolver')
  }

  if (options.deployRegistry) {
    steps.push('deploy-registry', 'set-registry')
  }

  steps.push('transfer-token')

  return steps
}

const STEP_LABELS: Record<TransferStepKind, string> = {
  'deploy-resolver': 'Deploy new resolver',
  'set-resolver': 'Set resolver',
  'deploy-registry': 'Deploy new registry',
  'set-registry': 'Set registry',
  'transfer-token': 'Transfer name',
}

export const getTransferStepLabel = (kind: TransferStepKind): string =>
  STEP_LABELS[kind]
