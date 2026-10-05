import {
  readWrapperExpiry,
  type WrapperExpiry,
  type WrapperExpiryReason,
} from '@ens-apps/bigname'
import { labelhash, namehash, zeroAddress } from 'viem'
import { GRACE_PERIOD_SECONDS } from './constants'

/**
 * The ENSv1 name facts `classifyName` reads. The field names are the ones the
 * ENSv1 subgraph used, because the migration plan, the batch journal (which
 * persists this shape in localStorage) and the dashboard all key on them.
 * Build it from bigname with `v1DomainFromBigname`.
 */
export type V1Domain = {
  /** Namehash. */
  id: string
  /** First label, or null when bigname cannot state it as a name. */
  labelName: string | null
  labelhash: string
  name: string
  resolver: { address: string } | null
  /** ENSv1 registry owner (the controller of an unwrapped `.eth` 2LD). */
  owner: { id: string }
  /**
   * BaseRegistrar token holder of an unwrapped `.eth` 2LD; null for subnames
   * and for wrapped names, whose token the NameWrapper contract holds.
   */
  registrant: { id: string } | null
  /** NameWrapper token holder while the name is wrapped. */
  wrappedOwner: { id: string } | null
  parent: {
    name: string
    wrappedDomain: { fuses: number } | null
  } | null
  /** BaseRegistrar lease; `.eth` 2LDs only. Unix seconds as a decimal string. */
  registration: {
    expiryDate: string
  } | null
  /** NameWrapper entry. `expiryDate` is unix seconds as a decimal string. */
  wrappedDomain: {
    expiryDate: string
    fuses: number
  } | null
}

/**
 * The ENSv1 half of a bigname name row (`ens_v1`): the BaseRegistrar lease
 * date and the NameWrapper state, fuse word and entry expiry. bigname serves
 * it exactly while the name's `authority` is `ens_v1` or `ens_v0`.
 */
export type BignameEnsV1Fields = {
  /** Lease expiry, decimal Unix seconds; `null` when the name has no lease (every subname). */
  readonly expires_at?: string | null
  /** Present exactly when `wrapper_fuses` is present. */
  readonly wrapper_state?: string
  readonly wrapper_fuses?: { readonly fuses: number }
  /**
   * The NameWrapper entry's own expiry, served after bigname v0.4.1: beside
   * `wrapper_state`, and alone, in the past, once an emancipated or locked
   * wrapper has lapsed. v0.4.1 never serves it, and later releases omit it
   * for an unwrapped name (even one that still serves `wrapper_state`) and
   * for a registry child with no name row, so its absence says nothing about
   * whether the name is wrapped.
   */
  readonly wrapper_expires_at?: string | null
  readonly wrapper_expires_at_reason?: WrapperExpiryReason
}

/**
 * The bigname name-profile fields the adapter reads: a structural subset of
 * `NameProfile` from `@ens-apps/bigname` (`GET /v1/names/{name}` and
 * `POST /v1/lookup` with `profile: 'detail'`), so a bigname record can be
 * passed in directly.
 */
export type BignameV1NameRecord = {
  readonly name: string
  readonly namehash: string
  /**
   * Token holder: the BaseRegistrar holder of an unwrapped `.eth` 2LD, the
   * NameWrapper holder of a wrapped name, else the registry owner.
   */
  readonly owner?: string
  /** Registry owner of an unwrapped name; the NameWrapper holder of a wrapped one. */
  readonly manager?: string
  /**
   * Decimal Unix seconds. For a `.eth` 2LD with a live ENSv2 entry this is
   * that entry's expiry, not the lease (`ens_v1.expires_at`); for a wrapped
   * subname it is the NameWrapper expiry. `null` with `expires_at_reason`.
   */
  readonly expires_at?: string | null
  readonly expires_at_reason?: string
  readonly registration_status?: string
  readonly resolver?: { readonly address: string } | null
  readonly ens_v1?: BignameEnsV1Fields
}

/**
 * A registration's resource restrictions, as `include=role_summary` address
 * name rows carry them (`restrictions`). Only the `ens_v1_wrapper` kind's
 * `wrapper_expires_at` is read: the exact NameWrapper entry expiry, and the
 * only place bigname v0.4.1 serves it.
 */
export type BignameV1Restrictions = {
  readonly kind: string
  readonly wrapper_expires_at?: string | null
  readonly wrapper_expires_at_reason?: WrapperExpiryReason
}

/** The parent's record; only its NameWrapper fuses are read. */
export type BignameV1ParentRecord = {
  readonly ens_v1?: Pick<BignameEnsV1Fields, 'wrapper_fuses'>
}

const PLACEHOLDER_LABEL = /^\[([0-9a-f]{64})\]$/i
const DECIMAL_SECONDS = /^(0|[1-9][0-9]*)$/
const MAX_UINT64 = (1n << 64n) - 1n

/** The parent of a dotted name, or null for a top-level name. */
export const v1ParentName = (name: string): string | null => {
  const dot = name.indexOf('.')
  return dot === -1 ? null : name.slice(dot + 1)
}

/** bigname timestamps are decimal Unix seconds; exact as a bigint. */
const toSeconds = (timestamp: string | null | undefined): bigint | undefined =>
  timestamp != null && DECIMAL_SECONDS.test(timestamp)
    ? BigInt(timestamp)
    : undefined

const safeNamehash = (name: string): string | undefined => {
  try {
    return namehash(name)
  } catch {
    return undefined
  }
}

const labelFacts = (
  record: BignameV1NameRecord,
): { labelName: string | null; labelhash: string } => {
  const label = record.name.split('.')[0] ?? ''
  const placeholder = PLACEHOLDER_LABEL.exec(label)
  if (placeholder) {
    return { labelName: label, labelhash: `0x${placeholder[1]?.toLowerCase()}` }
  }
  // bigname serves the normalized name. When the label on chain was not
  // normalized, the served name no longer hashes to the node, and a token id
  // derived from the served label would point at the wrong token.
  if (safeNamehash(record.name) !== record.namehash.toLowerCase()) {
    return { labelName: null, labelhash: labelhash(label) }
  }
  return { labelName: label, labelhash: labelhash(label) }
}

/** A `null` expiry: `no_expiry` is the uint64 maximum, `not_set` (a parent that set none) is zero. */
const nullExpiry = (reason: string | undefined): bigint =>
  reason === 'no_expiry' ? MAX_UINT64 : 0n

/**
 * A served NameWrapper expiry as the `uint64` the entry stores: `no_expiry`
 * is the maximum, `not_set` (a parent that set none) is zero.
 */
const storedWrapperExpiry = (expiry: WrapperExpiry): bigint =>
  expiry.expiresAt ?? nullExpiry(expiry.reason)

/**
 * The NameWrapper entry expiry bigname served for the name, or `undefined`
 * when the read did not carry one. `ens_v1.wrapper_expires_at` (after
 * v0.4.1, on every name-shaped row) comes first; the address row's
 * `restrictions` carry the same value on v0.4.1, for a backed wrapper read
 * with `include=role_summary`.
 */
const servedWrapperExpiry = (
  record: BignameV1NameRecord,
  restrictions: BignameV1Restrictions | null | undefined,
): WrapperExpiry | undefined =>
  readWrapperExpiry(record.ens_v1) ??
  (restrictions?.kind === 'ens_v1_wrapper'
    ? readWrapperExpiry(restrictions)
    : undefined)

/**
 * NameWrapper entry expiry when bigname served none: v0.4.1 name detail and
 * lookup never do, and its address-names walk does only with
 * `include=role_summary`. Derived:
 *
 * - A wrapped `.eth` 2LD: wrapping and `NameWrapper.renew` store the
 *   registrar lease plus the 90-day grace period, so it is
 *   `ens_v1.expires_at` + 90 days. A renewal through a controller that calls
 *   only `BaseRegistrar.renew` leaves the entry behind the lease; only the
 *   served value shows that. The top-level `expires_at` is the ENSv2 entry's
 *   expiry from the Universal Resolver cutover and must not be used.
 * - A wrapped subname: it has no lease, and bigname's top-level `expires_at`
 *   is "the NameWrapper entry's expiry, which is the only expiry the chain
 *   holds for it" (api-v1.md, `expires_at`). Assumption: that stays true for
 *   subnames after the cutover (the contract only moves `.eth` 2LDs to their
 *   ENSv2 entry's expiry); live Sepolia rows agree with
 *   `restrictions.wrapper_expires_at`. `null` with reason `not_set` is the
 *   zero expiry a parent leaves; `no_expiry` is the uint64 maximum.
 *
 * An expiry bigname omits outright is zero while the wrapper is only
 * `wrapped`; an emancipated or locked wrapper that has expired loses
 * `wrapper_state`, so an omitted value there is read as too large to
 * represent.
 */
const derivedWrapperExpiry = (
  record: BignameV1NameRecord,
  isDotEth2ld: boolean,
): bigint => {
  if (isDotEth2ld) {
    const lease = toSeconds(record.ens_v1?.expires_at)
    return lease === undefined ? 0n : lease + GRACE_PERIOD_SECONDS
  }
  const expiresAt = toSeconds(record.expires_at)
  if (expiresAt !== undefined) return expiresAt
  if (record.expires_at === null) return nullExpiry(record.expires_at_reason)
  return record.ens_v1?.wrapper_state === 'wrapped' ? 0n : MAX_UINT64
}

const wrapperEntry = (
  record: BignameV1NameRecord,
  isDotEth2ld: boolean,
  restrictions: BignameV1Restrictions | null | undefined,
): V1Domain['wrappedDomain'] => {
  const ensV1 = record.ens_v1
  const served = servedWrapperExpiry(record, restrictions)
  if (ensV1?.wrapper_state !== undefined && ensV1.wrapper_fuses) {
    // `wrapper_state` without a served expiry is a wrapped name on v0.4.1
    // and an unwrapped one afterwards; the two cannot be told apart from one
    // row, so it stays a wrapper entry and the on-chain ownership check
    // rejects the unwrapped case.
    const expiry = served
      ? storedWrapperExpiry(served)
      : derivedWrapperExpiry(record, isDotEth2ld)
    return {
      expiryDate: expiry.toString(),
      fuses: ensV1.wrapper_fuses.fuses,
    }
  }
  // A served expiry with no `wrapper_state`: an emancipated or locked wrapper
  // that lapsed past its own expiry. NameWrapper then reports no owner and a
  // cleared fuse word, and bigname omits `owner`, so nobody is classified as
  // holding it; the entry keeps its real expiry.
  if (served) {
    return { expiryDate: storedWrapperExpiry(served).toString(), fuses: 0 }
  }
  // Still held through the NameWrapper but without wrapper fields: bigname
  // omits them while the NameWrapper state is unknown or has lapsed. Read it
  // as an expired wrapper with a cleared fuse word; the on-chain ownership
  // check rejects it if the wrapper really is expired.
  if (record.registration_status === 'wrapped') {
    return { expiryDate: '0', fuses: 0 }
  }
  return null
}

/**
 * Adapt a bigname ENSv1 name record (and its parent's record, for parent
 * fuses) into the `V1Domain` shape `classifyName` reads.
 *
 * The NameWrapper entry's expiry is the one bigname serves:
 * `ens_v1.wrapper_expires_at` after v0.4.1, else the name's address-row
 * `restrictions` (`include=role_summary`) when the read has them. With
 * neither it is derived from the lease, which cannot show an entry that
 * trails its lease.
 *
 * Since bigname v0.3.0 `owner` is the token holder and `registrant` is gone:
 * - an unwrapped `.eth` 2LD's BaseRegistrar holder (the subgraph's
 *   `registrant`) is `owner`, and its registry owner (controller) is
 *   `manager`;
 * - a wrapped name's NameWrapper holder is `owner` (`manager` is the same
 *   holder, omitted while a wrapped `.eth` 2LD is in registrar grace);
 * - a subname with no token serves its registry owner as `owner`.
 *
 * The lease date (`registration.expiryDate`) is `ens_v1.expires_at`: past
 * it, a `.eth` 2LD is in its 90-day ENSv1 grace and is classified
 * `expired-registration`, which the grace-renewal flow picks up.
 */
export const v1DomainFromBigname = (
  record: BignameV1NameRecord,
  parent?: BignameV1ParentRecord | null,
  restrictions?: BignameV1Restrictions | null,
): V1Domain => {
  const parentName = v1ParentName(record.name)
  const isDotEth2ld = parentName === 'eth'
  const wrappedDomain = wrapperEntry(record, isDotEth2ld, restrictions)
  const registryOwner =
    (isDotEth2ld
      ? (record.manager ?? record.owner)
      : (record.owner ?? record.manager)) ?? zeroAddress
  // The BaseRegistrar token of a wrapped name is held by the NameWrapper
  // contract, which bigname does not serve; classification reads the
  // NameWrapper holder (`wrappedOwner`) for wrapped names instead.
  const registrant =
    isDotEth2ld && wrappedDomain === null && record.owner
      ? { id: record.owner.toLowerCase() }
      : null
  const registrationExpiry = isDotEth2ld
    ? toSeconds(record.ens_v1?.expires_at)
    : undefined

  return {
    id: record.namehash.toLowerCase(),
    ...labelFacts(record),
    name: record.name,
    resolver: record.resolver ? { address: record.resolver.address } : null,
    owner: { id: registryOwner.toLowerCase() },
    registrant,
    wrappedOwner:
      wrappedDomain && record.owner ? { id: record.owner.toLowerCase() } : null,
    parent: parentName
      ? {
          name: parentName,
          wrappedDomain: parent?.ens_v1?.wrapper_fuses
            ? { fuses: parent.ens_v1.wrapper_fuses.fuses }
            : null,
        }
      : null,
    registration:
      registrationExpiry !== undefined
        ? { expiryDate: registrationExpiry.toString() }
        : null,
    wrappedDomain,
  }
}
