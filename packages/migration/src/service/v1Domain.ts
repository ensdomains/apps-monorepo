import {
  type LookupRecord,
  toExactSeconds,
  type WrapperFuses,
} from '@ens-apps/indexer/bigname'
import { labelhash, zeroAddress } from 'viem'

export type V1Domain = {
  id: string
  labelName: string | null
  labelhash: string
  name: string
  resolver: { address: string } | null
  owner: { id: string }
  registrant: { id: string } | null
  wrappedOwner: { id: string } | null
  parent: {
    name: string
    wrappedDomain: { fuses: number } | null
  } | null
  registration: {
    expiryDate: string
  } | null
  wrappedDomain: {
    expiryDate: string
    fuses: number
  } | null
  /**
   * A `.eth` 2LD the index lists without a registrar lease. Absent in plans
   * saved before the flag existed.
   */
  isLeaseMissing?: true
  /**
   * The name holds no live ENSv2 reservation, which the migration controllers
   * claim. Absent in plans saved before the flag existed.
   */
  isUnreserved?: true
}

const MAX_WRAPPER_EXPIRY = (1n << 64n) - 1n

export const parentNameOf = (name: string): string | null => {
  const dot = name.indexOf('.')
  return dot === -1 ? null : name.slice(dot + 1)
}

const labelOf = (name: string): string => name.split('.')[0] ?? name

// Unwrap can retain fuses, but bigname omits the expiry for an inactive wrapper
// entry. A null expiry still denotes a current entry with no timestamp.
const currentWrapperFuses = (record: LookupRecord): WrapperFuses | undefined =>
  record.ens_v1?.wrapper_expires_at === undefined
    ? undefined
    : record.ens_v1.wrapper_fuses

/** Decimal unix seconds, the form the classifier reads with `BigInt`. */
const toSecondsString = (value: string | null | undefined): string | null =>
  toExactSeconds(value)?.toString() ?? null

const wrapperExpiryOf = (ensV1: LookupRecord['ens_v1']): string =>
  toSecondsString(ensV1?.wrapper_expires_at) ??
  (ensV1?.wrapper_expires_at_reason === 'no_expiry'
    ? MAX_WRAPPER_EXPIRY.toString()
    : '0')

/** Wrapped subnames read their parent's fuses to tell an emancipated child apart. */
export const needsParentFuses = (record: LookupRecord): boolean =>
  currentWrapperFuses(record) !== undefined &&
  parentNameOf(record.name) !== 'eth'

const toParent = (
  parentName: string | null,
  parentFuses: ReadonlyMap<string, number>,
): V1Domain['parent'] => {
  if (parentName === null) return null
  const fuses = parentFuses.get(parentName)
  return {
    name: parentName,
    wrappedDomain: fuses === undefined ? null : { fuses },
  }
}

// The top-level resolver can be withheld in late grace while the ENSv1 one
// still exists; an explicit null there means none is set.
const v1ResolverOf = (record: LookupRecord): { address: string } | null => {
  const resolver =
    record.ens_v1 && 'resolver' in record.ens_v1
      ? record.ens_v1.resolver
      : record.resolver
  return resolver ? { address: resolver.address } : null
}

/** The parents' current wrapper fuses, by name, for `toV1Domain`. */
export const toParentFuses = (
  parents: readonly LookupRecord[],
): ReadonlyMap<string, number> =>
  new Map(
    parents.flatMap((parent) => {
      const fuses = currentWrapperFuses(parent)?.fuses
      return fuses === undefined ? [] : [[parent.name, fuses] as const]
    }),
  )

/**
 * The subgraph-shaped view the classifier reads, from a bigname detail
 * record. bigname reports holders, not raw contract storage: a wrapped name's
 * registry owner (and a wrapped 2LD's registrant) is the NameWrapper, and an
 * unwrapped name's registry owner is its `manager`.
 */
export const toV1Domain = (
  record: LookupRecord,
  parentFuses: ReadonlyMap<string, number>,
  nameWrapper: string,
): V1Domain => {
  const label = labelOf(record.name)
  const parentName = parentNameOf(record.name)
  const ensV1 = record.ens_v1
  const wrapperFuses = currentWrapperFuses(record)
  const holder = record.owner ?? zeroAddress
  const registryOwner = wrapperFuses ? nameWrapper : (record.manager ?? holder)
  const registrant = wrapperFuses ? nameWrapper : (record.registrant ?? holder)
  const isDotEth2ld = parentName === 'eth'
  const registrationExpiry = toSecondsString(ensV1?.expires_at)
  return {
    id: record.namehash,
    labelName: label,
    labelhash: labelhash(label),
    name: record.name,
    resolver: v1ResolverOf(record),
    owner: { id: registryOwner },
    registrant: isDotEth2ld ? { id: registrant } : null,
    wrappedOwner: wrapperFuses ? { id: holder } : null,
    parent: toParent(parentName, parentFuses),
    registration:
      isDotEth2ld && registrationExpiry
        ? { expiryDate: registrationExpiry }
        : null,
    wrappedDomain: wrapperFuses
      ? {
          expiryDate: wrapperExpiryOf(ensV1),
          fuses: wrapperFuses.fuses,
        }
      : null,
    ...(isDotEth2ld && !registrationExpiry && { isLeaseMissing: true }),
    ...(record.unresolvable_reason === 'no_live_ens_v2_entry' && {
      isUnreserved: true,
    }),
  }
}
