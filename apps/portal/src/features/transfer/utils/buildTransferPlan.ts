/**
 * Turns the user's transfer options into an ordered list of on-chain steps.
 * Config steps run before the name moves, since the sender loses the authority
 * to make them once ownership changes hands. The move itself is always last,
 * and its shape depends on what is being moved (see `TransferSubject`).
 */

import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { NameRoleGrant, TransferSubject, V1TransferActor } from '../types'

export type TransferOptions = {
  /** Point the name's ETH address record at the recipient. */
  readonly setEthAddress: boolean
  /** Detach the name from its resolver (`setResolver(0x0)`). */
  readonly detachResolver: boolean
  /** Detach the name from its subregistry (`setSubregistry(0x0)`). V2 only. */
  readonly detachRegistry: boolean
  /**
   * Take back the registry roles the sender granted other accounts on this
   * name. V2 only — they are keyed on the label, so they outlive the token
   * move unless they are revoked first.
   */
  readonly revokeRoles: boolean
}

export type TransferStepKind =
  | 'set-eth-addr'
  | 'detach-resolver'
  | 'detach-registry'
  /** V2: `PermissionedRegistry.revokeRoles` for one third-party account. */
  | 'revoke-roles'
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
  /**
   * Recovery, never part of a plan: points the ETH address back at what it
   * was, after `set-eth-addr` landed but the move didn't.
   */
  | 'restore-eth-addr'

/**
 * One step of the plan. Every kind but `revoke-roles` is fully described by its
 * kind; a revoke is per account, so there is one step per third-party holder
 * and each carries whose grant it takes away.
 */
export type TransferStep =
  | { readonly kind: Exclude<TransferStepKind, 'revoke-roles'> }
  | { readonly kind: 'revoke-roles'; readonly grant: NameRoleGrant }

/** The step(s) that actually move the name, per subject kind. */
const MOVE_STEPS: Record<TransferSubject['kind'], readonly TransferStep[]> = {
  v2: [{ kind: 'transfer-token' }],
  'v1-wrapped': [{ kind: 'transfer-erc1155' }],
  // Controller first: after the 721 moves the sender is no longer the
  // registrant and can't reclaim, leaving them holding the controller slot.
  'v1-registrar': [{ kind: 'reclaim' }, { kind: 'transfer-erc721' }],
  'v1-registry': [{ kind: 'set-registry-owner' }],
}

export const buildTransferPlan = (
  options: TransferOptions,
  kind: TransferSubject['kind'],
  actor: V1TransferActor = 'owner',
  /** Third-party grants to revoke. Only ever non-empty for a V2 name. */
  roleGrants: readonly NameRoleGrant[] = [],
): TransferStep[] => {
  // A parent holds neither the subname's registry slot nor its wrapper token,
  // so it can't write the subname's records; the form never offers the config
  // steps, but the plan is the last line of defence.
  if (actor === 'parent') return [{ kind: 'set-subnode-owner' }]

  // Redundant once the resolver is detached, so only when the resolver is kept.
  const addressSteps: readonly TransferStep[] =
    options.setEthAddress && !options.detachResolver
      ? [{ kind: 'set-eth-addr' }]
      : []

  const resolverSteps: readonly TransferStep[] = options.detachResolver
    ? [{ kind: 'detach-resolver' }]
    : []

  // Only a V2 name has a subregistry to detach; the form never offers it
  // otherwise, but the plan is the last line of defence.
  const registrySteps: readonly TransferStep[] =
    options.detachRegistry && kind === 'v2' ? [{ kind: 'detach-registry' }] : []

  // Likewise, only a V2 name has registry roles. A grant with no roles left in
  // it would encode an empty bitmap, so it is dropped rather than sent.
  const revokeSteps: readonly TransferStep[] =
    options.revokeRoles && kind === 'v2'
      ? roleGrants
          .filter((grant) => grant.roles.length > 0)
          .map((grant) => ({ kind: 'revoke-roles', grant }) as const)
      : []

  return [
    ...addressSteps,
    ...resolverSteps,
    ...registrySteps,
    ...revokeSteps,
    ...MOVE_STEPS[kind],
  ]
}

export const STEP_LABELS: Record<TransferStepKind, string> = {
  'set-eth-addr': 'Update ETH address',
  'detach-resolver': 'Detach resolver',
  'detach-registry': 'Detach registry',
  'revoke-roles': 'Revoke permissions',
  'transfer-token': 'Transfer name',
  reclaim: 'Hand over manager role',
  'transfer-erc721': 'Transfer name',
  'transfer-erc1155': 'Transfer name',
  'set-registry-owner': 'Transfer name',
  'set-subnode-owner': 'Reassign subname',
  'restore-eth-addr': 'Restore ETH address',
}

/**
 * The ETH address record already points at the recipient, but the step that
 * moves the name never confirmed — a failed or abandoned move leaves the sender
 * owning a name that resolves to someone else. The move is always the plan's
 * last step.
 *
 * A step whose receipt never came back (polling timed out after the send) may
 * still have landed, so the chain decides instead:
 * - `isRecordRepointedOnChain`: the live ETH record points at the recipient.
 * - `mayHaveMoved`: the move's receipt was lost and the live holder doesn't
 *   prove it failed — the recipient holds it, or the read hasn't settled.
 *   Claiming the sender still owns it would offer a restore they can no longer
 *   authorize.
 */
export const isRecordAheadOfMove = (
  plan: readonly TransferStep[],
  confirmedSteps: ReadonlySet<TransferStepKind>,
  {
    isRecordRepointedOnChain = false,
    mayHaveMoved = false,
  }: {
    readonly isRecordRepointedOnChain?: boolean
    readonly mayHaveMoved?: boolean
  } = {},
): boolean => {
  const move = plan.at(-1)
  return (
    (confirmedSteps.has('set-eth-addr') || isRecordRepointedOnChain) &&
    move !== undefined &&
    !confirmedSteps.has(move.kind) &&
    !mayHaveMoved
  )
}

/**
 * A step's identity within one plan. The kind alone isn't enough: a plan can
 * carry several revokes, and the transaction manager keys each step — and the
 * "already started" guard — on this, so two accounts' revokes must not collide.
 */
export const transferStepKey = (step: TransferStep): string =>
  step.kind === 'revoke-roles'
    ? `revoke-roles-${step.grant.account.toLowerCase()}`
    : step.kind

/** The step's title in the transaction modal. */
export const describeTransferStep = (step: TransferStep): string =>
  step.kind === 'revoke-roles'
    ? `Revoke permissions from ${truncateAddress(step.grant.account)}`
    : STEP_LABELS[step.kind]
