/**
 * Turns the user's transfer options into an ordered list of on-chain steps.
 * Config steps run before the name moves, since the sender loses the authority
 * to make them once ownership changes hands. The move itself is always last,
 * and its shape depends on what is being moved (see `TransferSubject`).
 */

import type { TransferSubject, V1TransferActor } from '../types'

export type TransferOptions = {
  /** Point the name's ETH address record at the recipient. */
  readonly setEthAddress: boolean
  /** Detach the name from its resolver (`setResolver(0x0)`). */
  readonly detachResolver: boolean
  /** Detach the name from its subregistry (`setSubregistry(0x0)`). V2 only. */
  readonly detachRegistry: boolean
}

export type TransferStepKind =
  | 'set-eth-addr'
  | 'detach-resolver'
  | 'detach-registry'
  /** V2: `PermissionedRegistry.safeTransferFrom`. */
  | 'transfer-token'
  /** V1 unwrapped 2LD: `BaseRegistrar.reclaim` — hands the recipient the controller slot. */
  | 'reclaim'
  /** V1 unwrapped 2LD: `BaseRegistrar.safeTransferFrom` — hands over the registrant. */
  | 'transfer-erc721'
  /** V1 wrapped: `NameWrapper.safeTransferFrom`. */
  | 'transfer-erc1155'
  /** V1 registry-only: `ENSRegistry.setOwner`. */
  | 'set-registry-owner'
  /**
   * V1 subname moved by its parent: `NameWrapper.setSubnodeOwner` (wrapped) or
   * `ENSRegistry.setSubnodeOwner` (unwrapped), overriding the current holder.
   */
  | 'set-subnode-owner'

/** The step(s) that actually move the name, per subject kind. */
const MOVE_STEPS: Record<TransferSubject['kind'], readonly TransferStepKind[]> =
  {
    v2: ['transfer-token'],
    'v1-wrapped': ['transfer-erc1155'],
    // Controller first: after the 721 moves the sender is no longer the
    // registrant and can't reclaim, leaving them holding the controller slot.
    'v1-registrar': ['reclaim', 'transfer-erc721'],
    'v1-registry': ['set-registry-owner'],
  }

export const buildTransferPlan = (
  options: TransferOptions,
  kind: TransferSubject['kind'],
  actor: V1TransferActor = 'owner',
): TransferStepKind[] => {
  // A parent holds neither the subname's registry slot nor its wrapper token,
  // so it can't write the subname's records; the form never offers the config
  // steps, but the plan is the last line of defence.
  if (actor === 'parent') return ['set-subnode-owner']

  // Redundant once the resolver is detached, so only when the resolver is kept.
  const addressSteps: readonly TransferStepKind[] =
    options.setEthAddress && !options.detachResolver ? ['set-eth-addr'] : []

  const resolverSteps: readonly TransferStepKind[] = options.detachResolver
    ? ['detach-resolver']
    : []

  // Only a V2 name has a subregistry to detach; the form never offers it
  // otherwise, but the plan is the last line of defence.
  const registrySteps: readonly TransferStepKind[] =
    options.detachRegistry && kind === 'v2' ? ['detach-registry'] : []

  return [
    ...addressSteps,
    ...resolverSteps,
    ...registrySteps,
    ...MOVE_STEPS[kind],
  ]
}

export const STEP_LABELS: Record<TransferStepKind, string> = {
  'set-eth-addr': 'Update ETH address',
  'detach-resolver': 'Detach resolver',
  'detach-registry': 'Detach registry',
  'transfer-token': 'Transfer name',
  reclaim: 'Hand over manager role',
  'transfer-erc721': 'Transfer name',
  'transfer-erc1155': 'Transfer name',
  'set-registry-owner': 'Transfer name',
  'set-subnode-owner': 'Reassign subname',
}
