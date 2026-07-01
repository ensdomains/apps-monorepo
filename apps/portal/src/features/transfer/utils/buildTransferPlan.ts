/**
 * Pure builder that turns the user's transfer options into an ordered list of
 * on-chain steps.
 *
 * Ordering matters: every configuration step (set the default address, deploy /
 * point a new resolver or registry) must run BEFORE the ownership hand-off,
 * because once the ERC-1155 token is transferred the sender loses the roles
 * needed to make those changes. The token transfer is therefore always last.
 */

export type TransferOptions = {
  /** Set the name's ETH (coinType 60) address record to the recipient. */
  readonly setDefaultAddress: boolean
  /** Deploy a fresh dedicated resolver (admin = recipient) and point the name at it. */
  readonly deployResolver: boolean
  /** Deploy a fresh subregistry (admin = recipient) and point the name at it. */
  readonly deployRegistry: boolean
}

export type TransferStepKind =
  | 'set-default-address'
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

  // Runs first, on the name's *current* resolver (which the sender controls).
  // Mutually exclusive with deploying a new resolver — a freshly-deployed
  // resolver is owned by the recipient, so the sender can't write to it. The UI
  // disables this option when "deploy new resolver" is on, but guard here too.
  if (options.setDefaultAddress && !options.deployResolver) {
    steps.push('set-default-address')
  }

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
  'set-default-address': 'Set default address',
  'deploy-resolver': 'Deploy new resolver',
  'set-resolver': 'Set resolver',
  'deploy-registry': 'Deploy new registry',
  'set-registry': 'Set registry',
  'transfer-token': 'Transfer name',
}

export const getTransferStepLabel = (kind: TransferStepKind): string =>
  STEP_LABELS[kind]
