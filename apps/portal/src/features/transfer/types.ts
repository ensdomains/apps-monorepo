import type { Address } from 'viem'

/**
 * What kind of thing is being transferred. The form, the plan builder and the
 * step intents branch on `kind` once; everything protocol-specific hangs off it.
 *
 * ENSv2 has a single shape: an ERC-1155 token in a `PermissionedRegistry`.
 * ENSv1 has three, each moved by a different contract call:
 *
 * - `v1-wrapped`: an ERC-1155 in the NameWrapper (`safeTransferFrom`). Fuses
 *   gate the move and the resolver detach, and travel with the token.
 * - `v1-registrar`: an unwrapped `.eth` 2LD. Ownership is split between the
 *   ERC-721 *registrant* on the BaseRegistrar and the *controller* in the
 *   registry; a full handover is `reclaim` (controller) then `safeTransferFrom`
 *   (registrant), in that order — once the token has moved the sender can no
 *   longer reclaim.
 * - `v1-registry`: anything else in the legacy registry — an unwrapped subname
 *   or a non-`.eth` name. One slot, moved with `setOwner`.
 */
export type V2Subject = {
  readonly kind: 'v2'
  readonly owner: Address
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
}

export type V1WrappedSubject = {
  readonly kind: 'v1-wrapped'
  readonly owner: Address
  readonly fuses: {
    readonly cannotTransfer: boolean
    readonly cannotSetResolver: boolean
    readonly cannotUnwrap: boolean
    readonly parentCannotControl: boolean
  }
  /** Wrapper expiry in seconds, or null when unset. */
  readonly expiry: bigint | null
}

export type V1RegistrarSubject = {
  readonly kind: 'v1-registrar'
  /** ERC-721 owner on the BaseRegistrar. */
  readonly registrant: Address
  /** Registry owner — controls resolver, records and subnames. */
  readonly controller: Address | null
}

export type V1RegistrySubject = {
  readonly kind: 'v1-registry'
  readonly owner: Address
}

export type V1TransferSubject =
  | V1WrappedSubject
  | V1RegistrarSubject
  | V1RegistrySubject

export type TransferSubject = V2Subject | V1TransferSubject

export type TransferOptionKey =
  | 'setEthAddress'
  | 'detachResolver'
  | 'detachRegistry'

/** Which pre-move options the form should offer, and whether that is known yet. */
export type TransferDetachTargets = {
  readonly isOptionVisible: Readonly<Record<TransferOptionKey, boolean>>
  /** Every lookup succeeded — the targets are known. */
  readonly isSettled: boolean
  /** At least one lookup errored — the targets are unknown. */
  readonly hasFailed: boolean
}

/**
 * What a subname's parent can still do to it after the transfer, ready to
 * render. `powers` finish the sentence "they can …".
 */
export type ParentWarning = {
  readonly parentName: string
  readonly isLoading: boolean
  /** The check failed, so authority is unknown — never treat as "none". */
  readonly isError: boolean
  readonly parentIsSelf: boolean
  readonly powers: readonly string[]
}
