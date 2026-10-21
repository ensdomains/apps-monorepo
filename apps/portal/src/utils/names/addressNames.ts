import { type AddressName, toDate } from '@ens-apps/indexer/bigname'
import type {
  NameRegistrationStatus,
  NameRelation,
  NameSummary,
} from '@ens-apps/indexer/reads'
import { toValidDate } from '@/utils/temporal'
import type { ProtocolVersion } from '@/utils/types'

/** How the address relates to a name, including a name it held until it expired. */
export type AddressNameRelation = NameRelation | 'former_owner'

/** A name associated with an address, as the address pages list it. */
export type AddressNameItem = {
  readonly name: string
  /** Null when the name does not expire. */
  readonly expiryDate: Date | null
  /** An ENSv1 subname has no expiry of its own; it lapses with its `.eth` parent. */
  readonly parentExpiryDate?: Date | null
  readonly graceEndDate: Date | null
  readonly status: NameRegistrationStatus
  readonly subdomainCount?: number
  readonly recordCount?: number
  readonly relations: readonly AddressNameRelation[]
  readonly protocolVersion: ProtocolVersion
}

const RELATION_LABELS: Readonly<Record<AddressNameRelation, string>> = {
  owner: 'Owner',
  manager: 'Manager',
  role_holder: 'Role holder',
  former_owner: 'Former owner',
}

export const relationLabels = (
  relations: readonly AddressNameRelation[],
): readonly string[] => relations.map((relation) => RELATION_LABELS[relation])

const HIDDEN_STATUSES: readonly NameSummary['registrationStatus'][] = [
  'released',
  'unregistered',
]

/** A name from bigname's current relations, or null for one the pages hide. */
export const toAddressNameItem = (
  summary: NameSummary,
): AddressNameItem | null =>
  summary.name.endsWith('.reverse') ||
  HIDDEN_STATUSES.includes(summary.registrationStatus)
    ? null
    : {
        name: summary.name,
        expiryDate: summary.expiresAt,
        graceEndDate: summary.graceEndsAt,
        status: summary.registrationStatus,
        subdomainCount: summary.subnameCount,
        recordCount: summary.recordCount,
        relations: summary.relations,
        protocolVersion: summary.protocol === 'v1' ? 'ENSv1' : 'ENSv2',
      }

/** A name the address held until it expired, in grace or price cooldown. */
export const toLapsedItem = (row: AddressName): AddressNameItem => ({
  name: row.name,
  // A subregistry can mint an expiry a Date cannot hold; it reads as none.
  expiryDate: toValidDate(toDate(row.expires_at)),
  graceEndDate: toValidDate(toDate(row.grace_ends_at)),
  status: row.status,
  relations: ['former_owner'],
  protocolVersion: row.authority === 'ens_v2' ? 'ENSv2' : 'ENSv1',
})

/**
 * The `.eth` 2LD an ENSv1 subname lapses with, or null for a name with its own
 * expiry. Deeper names lapse with the same 2LD.
 */
export const ethParentOf = ({
  name,
  expiryDate,
  protocolVersion,
}: AddressNameItem): string | null => {
  if (expiryDate || protocolVersion !== 'ENSv1') return null
  const labels = name.split('.')
  if (labels.length < 3 || labels.at(-1) !== 'eth') return null
  return labels.slice(-2).join('.')
}

const byExpiry = (a: AddressNameItem, b: AddressNameItem) => {
  if (!a.expiryDate && !b.expiryDate) return 0
  if (!a.expiryDate) return 1
  if (!b.expiryDate) return -1
  return a.expiryDate.getTime() - b.expiryDate.getTime()
}

/** One row per name, a current relation winning over a lapsed one, soonest expiry first. */
export const mergeAddressNames = (
  current: readonly AddressNameItem[],
  inGrace: readonly AddressNameItem[],
): AddressNameItem[] => {
  const listed = new Set(current.map(({ name }) => name))
  return [
    ...current,
    ...inGrace.filter(({ name }) => !listed.has(name)),
  ].toSorted(byExpiry)
}
