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
  /** BaseRegistrar token holder; `.eth` 2LDs only. */
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
 * The bigname name-profile fields the adapter reads: a structural subset of
 * `NameProfile` from `@ens-apps/bigname` (`GET /v1/names/{name}` and
 * `POST /v1/lookup` with `profile: 'detail'`), so a bigname record can be
 * passed in directly.
 */
export type BignameV1NameRecord = {
  readonly name: string
  readonly namehash: string
  readonly owner?: string
  readonly manager?: string
  readonly registrant?: string
  /** RFC 3339. Omitted when zero, unknown or unrepresentable. */
  readonly expires_at?: string
  readonly registration_status?: string
  readonly resolver?: { readonly address: string } | null
  /** Present exactly when `wrapper_fuses` is present. */
  readonly wrapper_state?: string
  readonly wrapper_fuses?: { readonly fuses: number }
}

/** The parent's record; only its NameWrapper fuses are read. */
export type BignameV1ParentRecord = {
  readonly wrapper_fuses?: { readonly fuses: number }
}

const PLACEHOLDER_LABEL = /^\[([0-9a-f]{64})\]$/i
const MAX_UINT64 = (1n << 64n) - 1n

/** The parent of a dotted name, or null for a top-level name. */
export const v1ParentName = (name: string): string | null => {
  const dot = name.indexOf('.')
  return dot === -1 ? null : name.slice(dot + 1)
}

const toSeconds = (timestamp: string | undefined): bigint | undefined => {
  if (!timestamp) return undefined
  const ms = Date.parse(timestamp)
  return Number.isFinite(ms) ? BigInt(Math.floor(ms / 1000)) : undefined
}

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

/**
 * NameWrapper entry expiry from the name's own `expires_at` (api-v1.md,
 * Naming Dictionary): a wrapped `.eth` 2LD stores its registrar expiry plus
 * the 90-day grace period; a wrapped subname's `expires_at` is the wrapper
 * expiry itself. An omitted `expires_at` on a subname is zero (the parent set
 * none) while the wrapper is only `wrapped`; an emancipated or locked wrapper
 * that has expired loses `wrapper_state`, so an omitted value there is an
 * expiry too large to represent.
 */
const wrapperExpiry = (
  record: BignameV1NameRecord,
  isDotEth2ld: boolean,
): bigint => {
  const expiresAt = toSeconds(record.expires_at)
  if (expiresAt !== undefined) {
    return isDotEth2ld ? expiresAt + GRACE_PERIOD_SECONDS : expiresAt
  }
  return record.wrapper_state === 'wrapped' ? 0n : MAX_UINT64
}

const wrapperEntry = (
  record: BignameV1NameRecord,
  isDotEth2ld: boolean,
): V1Domain['wrappedDomain'] => {
  if (record.wrapper_state !== undefined && record.wrapper_fuses) {
    return {
      expiryDate: wrapperExpiry(record, isDotEth2ld).toString(),
      fuses: record.wrapper_fuses.fuses,
    }
  }
  // Still held through the NameWrapper but without wrapper fields: the
  // documented reading is an emancipated or locked position that has expired,
  // whose fuse word is cleared. The on-chain ownership check rejects it if the
  // wrapper really is expired.
  if (record.registration_status === 'wrapped') {
    return { expiryDate: '0', fuses: 0 }
  }
  return null
}

/**
 * Adapt a bigname ENSv1 name record (and its parent's record, for parent
 * fuses) into the `V1Domain` shape `classifyName` reads.
 *
 * bigname's `owner` is the token holder: the NameWrapper holder of a wrapped
 * name, the registry owner of a registry-only subname. The ENSv1 registry
 * owner of an unwrapped `.eth` 2LD (its controller) is served as `manager`.
 */
export const v1DomainFromBigname = (
  record: BignameV1NameRecord,
  parent?: BignameV1ParentRecord | null,
): V1Domain => {
  const parentName = v1ParentName(record.name)
  const isDotEth2ld = parentName === 'eth'
  const wrappedDomain = wrapperEntry(record, isDotEth2ld)
  const registryOwner =
    (isDotEth2ld
      ? (record.manager ?? record.owner)
      : (record.owner ?? record.manager)) ?? zeroAddress
  const registrationExpiry = isDotEth2ld
    ? toSeconds(record.expires_at)
    : undefined

  return {
    id: record.namehash.toLowerCase(),
    ...labelFacts(record),
    name: record.name,
    resolver: record.resolver ? { address: record.resolver.address } : null,
    owner: { id: registryOwner.toLowerCase() },
    registrant: record.registrant
      ? { id: record.registrant.toLowerCase() }
      : null,
    wrappedOwner:
      wrappedDomain && record.owner ? { id: record.owner.toLowerCase() } : null,
    parent: parentName
      ? {
          name: parentName,
          wrappedDomain: parent?.wrapper_fuses
            ? { fuses: parent.wrapper_fuses.fuses }
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
