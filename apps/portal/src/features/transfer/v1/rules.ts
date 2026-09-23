/**
 * Pure V1 transfer rules, derived from a `V1NameState` and the connected
 * account. Mirrors the contract gates off-chain so the UI refuses up front
 * rather than after an irreversible config step has landed:
 *
 * - NameWrapper `_beforeTransfer` reverts when `CANNOT_TRANSFER` is burned, and
 *   treats a `.eth` 2LD as expired from the start of its grace period.
 * - BaseRegistrar `ownerOf` (and so every 721 transfer and `reclaim`) reverts
 *   the moment a registration lapses, grace period included.
 * - `ENSRegistry.setOwner` requires the registry owner; PublicResolver writes
 *   require the registry owner (or the wrapper owner when wrapped).
 * - A parent moves a subname with `setSubnodeOwner`. On the wrapper that needs
 *   the parent's wrapper owner (refused while a `.eth` 2LD parent is in grace)
 *   and a child without PARENT_CANNOT_CONTROL; on the registry it needs the
 *   parent's registry owner. Crossing the two — a wrapped parent over an
 *   unwrapped child or vice versa — would forcibly wrap or unwrap the child, so
 *   like the legacy app we don't offer it.
 * - `BaseRegistrar.reclaim` is `onlyTokenOwner` + `live`, so only the registrant
 *   of an unwrapped, unexpired `.eth` 2LD can take its manager role back.
 */

import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { is2LD } from '@/utils/ens/tldHelpers'
import type {
  TransferOptionKey,
  V1ParentState,
  V1TransferActor,
  V1TransferSubject,
} from '../types'
import type { V1NameState, V1RegistrationStatus } from './getV1NameState'

export type V1TransferGate =
  /** `account` may move the name as `actor`; `subject` is what it will move. */
  | {
      readonly reason: 'ok'
      readonly subject: V1TransferSubject
      readonly actor: V1TransferActor
    }
  /**
   * Nothing left to move: a 2LD lapsed past grace, or a subname with no live
   * holder (an emancipated wrapped subname whose expiry has passed).
   */
  | { readonly reason: 'expired' }
  /** `.eth` 2LD in grace — locked until renewed. */
  | { readonly reason: 'grace' }
  /**
   * The `.eth` 2LD above this name has lapsed past grace: whoever registers it
   * next can re-issue every name under it, so a transfer hands over nothing.
   */
  | { readonly reason: 'ancestor-expired' }
  /**
   * Parent-initiated only: the wrapper refuses `setSubnodeOwner` from a `.eth`
   * 2LD parent in grace, and a deeper subtree is about to lapse anyway.
   */
  | { readonly reason: 'ancestor-grace' }
  /** Connected wallet controls the records but doesn't hold the token. */
  | { readonly reason: 'manager-only'; readonly registrant: Address }
  /** Connected wallet holds the parent, but can't reassign this subname. */
  | {
      readonly reason: 'parent-cannot-reassign'
      readonly why: /** The subname burned PARENT_CANNOT_CONTROL. */
        | 'emancipated'
        /** Wrapped parent over an unwrapped subname, or the reverse. */
        | 'wrapper-mismatch'
        /** Registrant of an unwrapped 2LD parent: must `reclaim` first. */
        | 'registrant-only'
    }
  | { readonly reason: 'not-owner' }
  /** `CANNOT_TRANSFER` burned — permanent. */
  | { readonly reason: 'cannot-transfer' }

const gateAsHolder = (
  subject: V1TransferSubject,
  account: Address,
): V1TransferGate | null =>
  match(subject)
    .with(
      { kind: 'v1-wrapped' },
      ({ owner }) => !isAddressEqual(owner, account),
      () => null,
    )
    .with(
      { kind: 'v1-wrapped', fuses: { cannotTransfer: true } },
      () => ({ reason: 'cannot-transfer' }) as const,
    )
    .with(
      { kind: 'v1-registrar' },
      ({ registrant }) => !isAddressEqual(registrant, account),
      ({ registrant, controller }) =>
        controller && isAddressEqual(controller, account)
          ? ({ reason: 'manager-only', registrant } as const)
          : null,
    )
    .with(
      { kind: 'v1-registry' },
      ({ owner }) => !isAddressEqual(owner, account),
      () => null,
    )
    .otherwise(() => ({ reason: 'ok', subject, actor: 'owner' }) as const)

const gateAsParent = (
  subject: V1TransferSubject,
  parent: V1ParentState | null,
  account: Address,
  ancestorRegistration: V1RegistrationStatus | null,
): V1TransferGate => {
  if (!parent) return { reason: 'not-owner' }
  const cannot = (
    why: 'emancipated' | 'wrapper-mismatch' | 'registrant-only',
  ) => ({ reason: 'parent-cannot-reassign', why }) as const

  if (parent.owner && isAddressEqual(parent.owner, account))
    return (
      match(subject)
        .with(
          { kind: 'v1-wrapped', fuses: { parentCannotControl: true } },
          () => cannot('emancipated'),
        )
        .with({ kind: 'v1-wrapped' }, () =>
          !parent.isWrapped
            ? cannot('wrapper-mismatch')
            : ancestorRegistration === 'gracePeriod'
              ? ({ reason: 'ancestor-grace' } as const)
              : ({ reason: 'ok', subject, actor: 'parent' } as const),
        )
        // The registry has no notion of expiry, so a grace-period ancestor
        // doesn't stop this write — but see `V1Notices` for the warning.
        .with({ kind: 'v1-registry' }, () =>
          parent.isWrapped
            ? cannot('wrapper-mismatch')
            : ({ reason: 'ok', subject, actor: 'parent' } as const),
        )
        // Unreachable: a 2LD has no parent.
        .with(
          { kind: 'v1-registrar' },
          () => ({ reason: 'not-owner' }) as const,
        )
        .exhaustive()
    )

  if (parent.registrant && isAddressEqual(parent.registrant, account))
    return cannot('registrant-only')

  return { reason: 'not-owner' }
}

export const getV1TransferGate = (
  { subject, registration, parent, ancestorRegistration }: V1NameState,
  account: Address,
): V1TransferGate =>
  match({ subject, registration, ancestorRegistration })
    // Registration status first, whoever is asking: a lapsed name has no live
    // owner to authorise anything.
    .with({ registration: 'gracePeriod' }, () => ({ reason: 'grace' }) as const)
    .with({ registration: 'expired' }, () => ({ reason: 'expired' }) as const)
    .with(
      { ancestorRegistration: 'expired' },
      () => ({ reason: 'ancestor-expired' }) as const,
    )
    .with({ subject: null }, () => ({ reason: 'expired' }) as const)
    .with(
      { subject: P.nonNullable },
      ({ subject, ancestorRegistration }) =>
        gateAsHolder(subject, account) ??
        gateAsParent(subject, parent, account, ancestorRegistration),
    )
    .exhaustive()

/**
 * Whether `account` can set the resolver on a V1 name.
 *
 * The resolver pointer lives on the name's registry slot, so the authority is
 * whoever holds that slot: the controller of an unwrapped `.eth` 2LD (the
 * registrant alone cannot), the wrapper owner of a wrapped name unless
 * CANNOT_SET_RESOLVER is burned, and the registry owner of anything else —
 * an unwrapped subname or an imported DNS name.
 *
 * Unlike {@link getV1DetachTargets}, which runs behind a page that has already
 * established the caller is the holder, this checks `account` itself: the
 * resolver page offers its button to anyone viewing the name.
 *
 * Operators (`setApprovalForAll`) are authorised on chain too but are not
 * recognised here, so the button stays hidden for them.
 */
export const canSetV1Resolver = ({
  subject,
  account,
}: {
  readonly subject: V1TransferSubject
  readonly account: Address
}): boolean =>
  match(subject)
    .with(
      { kind: 'v1-registrar' },
      ({ controller }) =>
        controller !== null && isAddressEqual(controller, account),
    )
    .with(
      { kind: 'v1-wrapped' },
      ({ owner, fuses }) =>
        isAddressEqual(owner, account) && !fuses.cannotSetResolver,
    )
    .with({ kind: 'v1-registry' }, ({ owner }) =>
      isAddressEqual(owner, account),
    )
    .exhaustive()

/**
 * Which pre-move options to offer. An option is only shown when there is a
 * target *and* the sender holds the authority to act on it, since these steps
 * run before the irreversible move.
 */
export const getV1DetachTargets = ({
  subject,
  actor,
  resolverAddress,
  account,
  hasEthAddress,
}: {
  readonly subject: V1TransferSubject
  readonly actor: V1TransferActor
  readonly resolverAddress: Address | null
  readonly account: Address
  readonly hasEthAddress: boolean
}): Readonly<Record<TransferOptionKey, boolean>> => {
  // Resolver record writes: PublicResolver authorises the registry owner, or
  // the wrapper owner when the registry owner is the wrapper. For an unwrapped
  // 2LD that is the controller — the registrant alone can't write records. A
  // parent holds neither slot on the subname, so it can't touch its records.
  const canWriteRecords = match({ subject, actor })
    .with({ actor: 'parent' }, () => false)
    .with(
      { subject: { kind: 'v1-registrar' } },
      ({ subject: { controller } }) =>
        controller !== null && isAddressEqual(controller, account),
    )
    .otherwise(() => true)

  // `setResolver`: same authority, plus the wrapper refuses it once
  // CANNOT_SET_RESOLVER is burned.
  const canDetachResolver =
    canWriteRecords &&
    !(subject.kind === 'v1-wrapped' && subject.fuses.cannotSetResolver)

  return {
    setEthAddress: resolverAddress !== null && hasEthAddress && canWriteRecords,
    detachResolver: resolverAddress !== null && canDetachResolver,
    // A V1 name has no subregistry.
    detachRegistry: false,
  }
}

/**
 * Whether the parent gets the label back once an emancipated subname lapses.
 * `_checkCanCallSetSubnodeOwner` lets the parent re-issue an expired subname
 * unless it burned CANNOT_CREATE_SUBDOMAIN. That bit holds only until the
 * parent's own wrapper expiry — `_clearOwnerAndFuses` zeroes every fuse past
 * it — so this answers "can it today", not "can it ever". A null parent is
 * unknown, not a no.
 */
export const canParentReissueV1Subname = (
  parent: V1ParentState | null,
): boolean => !(parent?.isWrapped && parent.cannotCreateSubdomain)

/**
 * What the parent can still do to a subname after it is transferred — each
 * entry finishes the sentence "they can…". Empty for any 2LD: a `.eth` 2LD's
 * parent is the registrar, and a DNS name's exposure is to the domain holder
 * rather than a parent name (see `V1Notices`).
 */
export const getV1ParentPowers = (
  name: string,
  subject: V1TransferSubject,
  parent: V1ParentState | null,
): readonly string[] =>
  match(subject)
    .when(
      () => is2LD(name),
      () => [],
    )
    // Emancipated: the parent is locked out until the wrapper expiry lapses,
    // and only then if it can still re-issue the label.
    .with({ kind: 'v1-wrapped', fuses: { parentCannotControl: true } }, () =>
      canParentReissueV1Subname(parent)
        ? ['issue it to someone else once it expires']
        : [],
    )
    // `setSubnodeOwner` on the parent node, with no fuse to stop it — on either
    // contract, whichever way the child is held.
    .with({ kind: 'v1-wrapped' }, { kind: 'v1-registry' }, () => [
      'replace it or take it back at any time',
    ])
    .with({ kind: 'v1-registrar' }, () => [])
    .exhaustive()

/** Who a transfer takes the name from. For an unwrapped `.eth` 2LD that is the
 * ERC-721 registrant, not the controller `resolveEnsOwner` reports. */
export const getV1Holder = (subject: V1TransferSubject): Address =>
  match(subject)
    .with({ kind: 'v1-registrar' }, ({ registrant }) => registrant)
    .with({ kind: 'v1-wrapped' }, { kind: 'v1-registry' }, ({ owner }) => owner)
    .exhaustive()

/**
 * Whether `account` can take the manager role back with
 * `BaseRegistrar.reclaim(tokenId, account)` — what the Ownership page's Reclaim
 * button is gated on, and the way out of the `registrant-only` refusal above.
 *
 * Only an unwrapped `.eth` 2LD reaches this: it is the one shape where the
 * ERC-721 registrant and the registry owner can be different wallets. `live(id)`
 * rules out grace (`expiries[id]` has already passed), though in practice a name
 * in grace arrives with no registrant at all because `ownerOf` reverts first.
 * A manager that is already `account` has nothing to reclaim; an absent one does.
 */
export const canReclaimV1Manager = (
  state: V1NameState | null | undefined,
  account: Address | undefined,
): boolean =>
  !!state &&
  !!account &&
  state.subject?.kind === 'v1-registrar' &&
  state.registration === 'active' &&
  isAddressEqual(state.subject.registrant, account) &&
  (!state.subject.controller ||
    !isAddressEqual(state.subject.controller, account))
