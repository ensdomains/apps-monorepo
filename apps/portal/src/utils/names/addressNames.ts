import type { AddressName } from '@ens-apps/indexer/bigname'
import type { NameRelation, NameSummary } from '@ens-apps/indexer/reads'
import { toValidDate } from '@/utils/temporal'
import type { ProtocolVersion } from '@/utils/types'

/** How the address relates to a name, including a name it held until it expired. */
export type AddressNameRelation = NameRelation | 'former_owner'

/** A name associated with an address, as the address pages list it. */
export type AddressNameItem = {
  readonly name: string
  /** Null when the name does not expire. */
  readonly expiryDate: Date | null
  readonly subdomainCount?: number
  readonly recordCount?: number
  readonly relations: readonly AddressNameRelation[]
  /** ENSv2 only: the roles the address holds on the name. */
  readonly roleCount?: number
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
        subdomainCount: summary.subnameCount,
        recordCount: summary.recordCount,
        relations: summary.relations,
        protocolVersion: summary.protocol === 'v1' ? 'ENSv1' : 'ENSv2',
      }

const MS_PER_SECOND = 1000

/** An ENSv2 name in grace, which the address can still renew. */
export const toGraceItem = (row: AddressName): AddressNameItem => ({
  name: row.name,
  // A subregistry can mint an expiry a Date cannot hold; it reads as none.
  expiryDate: row.expires_at
    ? toValidDate(new Date(Number(row.expires_at) * MS_PER_SECOND))
    : null,
  relations: ['former_owner'],
  protocolVersion: 'ENSv2',
})

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
