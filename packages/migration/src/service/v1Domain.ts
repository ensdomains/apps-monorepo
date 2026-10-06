import {
  readWrapperExpiry,
  type WrapperExpiry,
  type WrapperExpiryReason,
} from '@ens-apps/bigname'
import { labelhash, namehash, zeroAddress } from 'viem'

/**
 * The ENSv1 name facts `classifyName` reads. The field names are the ones the
 * ENSv1 subgraph used, because the migration plan, the batch journal (which
 * persists this shape in localStorage) and the dashboard all key on them.
 * Build it from bigname with `v1DomainFromBigname`.
 */
export type V1Domain = {
  /** Served by BigName; absent in older persisted plans. */
  unresolvableReason?: string
  /** The indexer explicitly returned a .eth row without a registrar lease. */
  registrationMissing?: true
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
  /** Exact NameWrapper entry expiry, absent when no current wrapper entry exists. */
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
  readonly unresolvable_reason?: string
  readonly resolver?: { readonly address: string } | null
  readonly ens_v1?: BignameEnsV1Fields
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

/** Read the NameWrapper entry served by the merged BigName release. */
const wrapperEntry = (
  record: BignameV1NameRecord,
): V1Domain['wrappedDomain'] => {
  const expiry = readWrapperExpiry(record.ens_v1)
  if (expiry) {
    return {
      expiryDate: storedWrapperExpiry(expiry).toString(),
      fuses: record.ens_v1?.wrapper_fuses?.fuses ?? 0,
    }
  }
  if (record.registration_status === 'wrapped') {
    throw new Error(`Missing NameWrapper expiry for ${record.name}`)
  }
  // An unwrapped name can retain wrapper metadata. Without a current entry
  // expiry it must not be treated as a held NameWrapper token.
  return null
}

const migrationAvailability = (
  record: BignameV1NameRecord,
  isDotEth2ld: boolean,
  registrationExpiry: bigint | undefined,
): Pick<V1Domain, 'registrationMissing' | 'unresolvableReason'> => ({
  ...(record.unresolvable_reason
    ? { unresolvableReason: record.unresolvable_reason }
    : {}),
  ...(isDotEth2ld && registrationExpiry === undefined
    ? { registrationMissing: true }
    : {}),
})

/**
 * Adapt a bigname ENSv1 name record (and its parent's record, for parent
 * fuses) into the `V1Domain` shape `classifyName` reads.
 *
 * The NameWrapper entry's expiry is `ens_v1.wrapper_expires_at`.
 * Missing expiry on a wrapped row is an error, not a lease-based estimate.
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
): V1Domain => {
  const parentName = v1ParentName(record.name)
  const isDotEth2ld = parentName === 'eth'
  const wrappedDomain = wrapperEntry(record)
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
    ...migrationAvailability(record, isDotEth2ld, registrationExpiry),
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
