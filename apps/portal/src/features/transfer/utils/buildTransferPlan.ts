/**
 * Turns the user's transfer options into an ordered list of on-chain steps.
 * Config steps run before the token moves, since the sender loses the roles to
 * make them once the ERC-1155 token transfers. The token transfer is last.
 */

export type TransferOptions = {
  /** Point the name's ETH address record at the recipient. */
  readonly setEthAddress: boolean
  /** Detach the name from its resolver (`setResolver(0x0)`). */
  readonly resetResolver: boolean
  /** Detach the name from its subregistry (`setSubregistry(0x0)`). */
  readonly resetRegistry: boolean
}

export type TransferStepKind =
  | 'set-eth-addr'
  | 'reset-resolver'
  | 'reset-registry'
  | 'transfer-token'

export const buildTransferPlan = (
  options: TransferOptions,
): TransferStepKind[] => {
  const steps: TransferStepKind[] = []

  // Redundant once the resolver is detached, so only when the resolver is kept.
  if (options.setEthAddress && !options.resetResolver) {
    steps.push('set-eth-addr')
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
  'set-eth-addr': 'Update ETH address',
  'reset-resolver': 'Reset resolver',
  'reset-registry': 'Reset registry',
  'transfer-token': 'Transfer name',
}
