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
 */

import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { is2LD } from '@/utils/ens/tldHelpers'
import type { TransferOptionKey, V1TransferSubject } from '../types'
import type { V1NameState } from './getV1NameState'

export type V1TransferGate =
  /** `account` may transfer; `subject` is what it will move. */
  | { readonly reason: 'ok'; readonly subject: V1TransferSubject }
  /** Registration lapsed past grace — anyone can register it. */
  | { readonly reason: 'expired' }
  /** `.eth` 2LD in grace — locked until renewed. */
  | { readonly reason: 'grace' }
  /** Connected wallet controls the records but doesn't hold the token. */
  | { readonly reason: 'manager-only'; readonly registrant: Address }
  | { readonly reason: 'not-owner' }
  /** `CANNOT_TRANSFER` burned — permanent. */
  | { readonly reason: 'cannot-transfer' }

export const getV1TransferGate = (
  { subject, registration }: V1NameState,
  account: Address,
): V1TransferGate =>
  match({ subject, registration })
    // Registration status first, whoever is asking: a lapsed name has no live
    // owner to authorise anything.
    .with({ registration: 'gracePeriod' }, () => ({ reason: 'grace' }) as const)
    .with(
      { registration: 'expired' },
      { subject: null },
      () => ({ reason: 'expired' }) as const,
    )
    .with(
      { subject: { kind: 'v1-wrapped' } },
      ({ subject }) => !isAddressEqual(subject.owner, account),
      () => ({ reason: 'not-owner' }) as const,
    )
    .with(
      { subject: { kind: 'v1-wrapped', fuses: { cannotTransfer: true } } },
      () => ({ reason: 'cannot-transfer' }) as const,
    )
    .with(
      { subject: { kind: 'v1-registrar' } },
      ({ subject }) => !isAddressEqual(subject.registrant, account),
      ({ subject }) =>
        subject.controller && isAddressEqual(subject.controller, account)
          ? ({
              reason: 'manager-only',
              registrant: subject.registrant,
            } as const)
          : ({ reason: 'not-owner' } as const),
    )
    .with(
      { subject: { kind: 'v1-registry' } },
      ({ subject }) => !isAddressEqual(subject.owner, account),
      () => ({ reason: 'not-owner' }) as const,
    )
    .with(
      { subject: P.nonNullable },
      ({ subject }) => ({ reason: 'ok', subject }) as const,
    )
    .exhaustive()

/**
 * Which pre-move options to offer. An option is only shown when there is a
 * target *and* the sender holds the authority to act on it, since these steps
 * run before the irreversible move.
 */
export const getV1DetachTargets = ({
  subject,
  resolverAddress,
  account,
  hasEthAddress,
}: {
  readonly subject: V1TransferSubject
  readonly resolverAddress: Address | null
  readonly account: Address
  readonly hasEthAddress: boolean
}): Readonly<Record<TransferOptionKey, boolean>> => {
  // Resolver record writes: PublicResolver authorises the registry owner, or
  // the wrapper owner when the registry owner is the wrapper. For an unwrapped
  // 2LD that is the controller — the registrant alone can't write records.
  const canWriteRecords = match(subject)
    .with(
      { kind: 'v1-registrar' },
      ({ controller }) =>
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
 * What the parent can still do to a subname after it is transferred — each
 * entry finishes the sentence "they can…". Empty for any 2LD: a `.eth` 2LD's
 * parent is the registrar, and a DNS name's exposure is to the domain holder
 * rather than a parent name (see `V1Notices`).
 */
export const getV1ParentPowers = (
  name: string,
  subject: V1TransferSubject,
): readonly string[] =>
  match(subject)
    .when(
      () => is2LD(name),
      () => [],
    )
    // Emancipated: the parent is locked out until the wrapper expiry lapses, at
    // which point it can issue the label afresh.
    .with(
      { kind: 'v1-wrapped', fuses: { parentCannotControl: true } },
      ({ expiry }) =>
        expiry === null ? [] : ['issue it to someone else once it expires'],
    )
    // `setSubnodeOwner` on the parent node, with no fuse to stop it.
    .with({ kind: 'v1-wrapped' }, { kind: 'v1-registry' }, () => [
      'replace it or take it back at any time',
    ])
    .with({ kind: 'v1-registrar' }, () => [])
    .exhaustive()
