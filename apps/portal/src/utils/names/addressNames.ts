import {
  type AddressNameRow,
  type Grant,
  grantsForAddress,
} from '@ens-apps/bigname'
import { encodeRoleBitmap, type Role } from '@ensdomains/ensjs/utils/v2'
import { registryPowerRole } from '@/lib/roles/registryPowerRoles'
import type { ProtocolVersion } from '@/utils/types'
import { hasNameRow } from './registryChildName'
import { servedExpiry } from './servedExpiry'

/**
 * Owner / Manager badges for an ENSv1 name.
 */
export type V1Roles = {
  owner?: boolean
  manager?: boolean
}

/**
 * One row of an address's name list, as the dashboard, the names page and the
 * shared name table/card components render it.
 */
export type AddressNameItem = {
  name: string
  /**
   * Expiry the name's protocol enforces (`servedExpiry`): the ENSv1 lease for
   * a name ENSv1 decides, else the served expiry; null when it has none.
   */
  expiryDate: Date | null
  /** End of the renewal grace of `expiryDate`; null when it has none. */
  graceEndDate: Date | null
  /**
   * False for a registry child bigname lists without a name row: its name
   * routes 404, so it is shown unlinked and not counted as a name.
   */
  hasNameRow: boolean
  protocolVersion: ProtocolVersion
  subdomainCount?: number
  recordCount?: number
  /** ENSv2 registry roles the address holds, as an ensjs role bitmap. */
  roleBitmap: string | null
  /** ENSv1 Owner / Manager badges. */
  v1Roles: V1Roles | null
  /**
   * Authority relations between the address and the name (`relation=any`), or
   * `['resolves_to']` for a name that only resolves to the address.
   */
  relations: AddressNameRow['relations']
}

/** Direct grants on the registry itself or on the name's registration. */
const isRegistryGrant = (grant: Grant) =>
  grant.grant_relation === undefined &&
  (grant.grant_scope.kind === 'root' ||
    grant.grant_scope.kind === 'registry' ||
    grant.grant_scope.kind === 'registration')

/**
 * The ENSv2 registry roles `address` holds on a row, as a role bitmap. Resolver,
 * record-manager and operator grants are left out, as the Panoptes `roles` read
 * this replaces only returned registry roles.
 */
export const registryRoleBitmap = (
  row: Pick<AddressNameRow, 'role_summary'>,
  address: string,
): string | null => {
  const roles = new Set<Role>()
  for (const grant of grantsForAddress(row.role_summary, address)) {
    if (!isRegistryGrant(grant)) continue
    for (const power of grant.powers) {
      const role = registryPowerRole(power)
      if (role) roles.add(role)
    }
  }
  return roles.size > 0
    ? `0x${encodeRoleBitmap([...roles]).toString(16)}`
    : null
}

/**
 * Owner / Manager badges from the row's relations (bigname v0.3.0+). `owner`
 * is the token holder: the BaseRegistrar holder of an unwrapped `.eth` 2LD,
 * the NameWrapper holder of a wrapped name, else the registry owner. `manager`
 * is whoever can change the registry record: the registry owner of an
 * unwrapped name, the NameWrapper holder of a wrapped one (so a wrapped name's
 * holder gets both badges). bigname omits `manager` while a wrapped `.eth` 2LD
 * is in its registrar grace, so the Manager badge drops then.
 */
const v1RolesFromRelations = (
  row: Pick<AddressNameRow, 'relations'>,
): V1Roles => ({
  owner: row.relations.includes('owner'),
  manager: row.relations.includes('manager'),
})

/**
 * Released ENSv1 leases are past their grace period; the ENSv1 subgraph list
 * this replaces never showed them. Renewable ENSv2 names are supplied by a
 * separate former_owner read, bounded to their exclusive grace period.
 */
const isLapsedV1 = (row: AddressNameRow) =>
  row.registration_status === 'released' && row.authority !== 'ens_v2'

const toDate = (seconds: number | null): Date | null =>
  seconds === null ? null : new Date(seconds * 1000)

/**
 * Display order: names with an expiry first, in the server's ascending order,
 * then names that do not expire, then registry children without a name row.
 * bigname sorts a missing `expires_at` smallest (first ascending), and the
 * ENSv1 lease date that `expiryDate` shows is not the value it sorts on.
 */
const displayRank = (item: AddressNameItem): number => {
  if (!item.hasNameRow) return 2
  return item.expiryDate ? 0 : 1
}

const byDisplayOrder = (a: AddressNameItem, b: AddressNameItem): number =>
  displayRank(a) - displayRank(b) ||
  (a.expiryDate?.getTime() ?? 0) - (b.expiryDate?.getTime() ?? 0)

/**
 * The address's authority rows (`relation=any`) plus the names that only
 * resolve to it (`relation=resolves_to`), merged by namehash. A name on both
 * keeps its authority row, so its relations and badges are unchanged; a
 * resolve-only name keeps `relations: ['resolves_to']`, so it gets no Owner,
 * Manager or role badge, and `partitionOwnedNames` puts it under "assigned"
 * unless the address holds its `.eth` 2LD. The ENSv1 subgraph list this
 * replaces read them through ensjs's `resolvedAddress` clause, with the same
 * result.
 */
export const withResolvedNames = (
  authorityRows: readonly AddressNameRow[],
  resolvedRows: readonly AddressNameRow[],
): AddressNameRow[] => {
  const listed = new Set(authorityRows.map(({ namehash }) => namehash))
  return [
    ...authorityRows,
    ...resolvedRows.filter(({ namehash }) => !listed.has(namehash)),
  ]
}

/**
 * Maps address-name rows (`withResolvedNames`) to list rows, in display order
 * (`byDisplayOrder`).
 */
export const toAddressNameItems = (
  rows: readonly AddressNameRow[],
  address: string,
): AddressNameItem[] =>
  rows
    .filter((row) => !isLapsedV1(row))
    .map((row): AddressNameItem => {
      const isV2 = row.authority === 'ens_v2'
      const { expiry, graceEndsAt } = servedExpiry(row)
      return {
        name: row.name,
        expiryDate: toDate(expiry),
        graceEndDate: toDate(graceEndsAt),
        hasNameRow: hasNameRow(row),
        protocolVersion: isV2 ? 'ENSv2' : 'ENSv1',
        subdomainCount: row.subname_count,
        recordCount: row.record_count,
        roleBitmap: isV2 ? registryRoleBitmap(row, address) : null,
        v1Roles: isV2 ? null : v1RolesFromRelations(row),
        relations: row.relations,
      }
    })
    .toSorted(byDisplayOrder)
