import {
  type AddressNameRow,
  type Grant,
  grantsForAddress,
  type Power,
  parseTimestamp,
} from '@ens-apps/bigname'
import { encodeRoleBitmap, type Role } from '@ensdomains/ensjs/utils/v2'
import type { ProtocolVersion } from '@/utils/types'

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
  /** Bare registrar (or NameWrapper) expiry; null when the name has none. */
  expiryDate: Date | null
  protocolVersion: ProtocolVersion
  subdomainCount?: number
  recordCount?: number
  /** ENSv2 registry roles the address holds, as an ensjs role bitmap. */
  roleBitmap: string | null
  /** ENSv1 Owner / Manager badges. */
  v1Roles: V1Roles | null
  /** Authority relations between the address and the name (`relation=any`). */
  relations: AddressNameRow['relations']
}

/**
 * bigname's registry powers, keyed to the ensjs role each one is. The shared
 * table and card count roles with `decodeRoleBitmap`, so the powers are folded
 * back into that bitmap rather than giving those components a second format.
 */
const REGISTRY_POWER_ROLES: Partial<Record<Power, Role>> = {
  registrar: 'ROLE_REGISTRAR',
  admin_registrar: 'ROLE_REGISTRAR_ADMIN',
  register_reserved: 'ROLE_REGISTER_RESERVED',
  admin_register_reserved: 'ROLE_REGISTER_RESERVED_ADMIN',
  set_parent: 'ROLE_SET_PARENT',
  admin_set_parent: 'ROLE_SET_PARENT_ADMIN',
  unregister: 'ROLE_UNREGISTER',
  admin_unregister: 'ROLE_UNREGISTER_ADMIN',
  renew: 'ROLE_RENEW',
  admin_renew: 'ROLE_RENEW_ADMIN',
  set_subregistry: 'ROLE_SET_SUBREGISTRY',
  admin_set_subregistry: 'ROLE_SET_SUBREGISTRY_ADMIN',
  set_resolver: 'ROLE_SET_RESOLVER',
  admin_set_resolver: 'ROLE_SET_RESOLVER_ADMIN',
  can_transfer_admin: 'ROLE_CAN_TRANSFER_ADMIN',
  was_reserved: 'ROLE_WAS_RESERVED',
  set_uri: 'ROLE_SET_URI',
  admin_set_uri: 'ROLE_SET_URI_ADMIN',
  upgrade: 'ROLE_UPGRADE',
  admin_upgrade: 'ROLE_UPGRADE_ADMIN',
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
      const role = REGISTRY_POWER_ROLES[power]
      if (role) roles.add(role)
    }
  }
  return roles.size > 0
    ? `0x${encodeRoleBitmap([...roles]).toString(16)}`
    : null
}

/**
 * Owner / Manager badges from the row's relations. `registrant` is the
 * registrar token holder (the NameWrapper holder for a wrapped `.eth` name);
 * for a wrapped subname, which has no registrant, the token holder is `owner`.
 * The registry owner of an unwrapped subname is its manager, not its owner,
 * matching the badges ensjs relations produced.
 */
const v1RolesFromRelations = (
  row: Pick<AddressNameRow, 'relations' | 'registration_status'>,
): V1Roles => ({
  owner:
    row.relations.includes('registrant') ||
    (row.registration_status === 'wrapped' && row.relations.includes('owner')),
  manager: row.relations.includes('manager'),
})

/**
 * Released ENSv1 leases are past their grace period; the ENSv1 subgraph list
 * this replaces never showed them. Expired ENSv2 names were listed, and still
 * are.
 */
const isLapsedV1 = (row: AddressNameRow) =>
  row.registration_status === 'released' && row.authority !== 'ens_v2'

/**
 * Maps a `relation=any` address-name page to list rows. Rows keep the server
 * order (`sort=expires_at`, unknown expiries last).
 */
export const toAddressNameItems = (
  rows: readonly AddressNameRow[],
  address: string,
): AddressNameItem[] =>
  rows
    .filter((row) => !isLapsedV1(row))
    .map((row) => {
      const isV2 = row.authority === 'ens_v2'
      return {
        name: row.name,
        expiryDate: parseTimestamp(row.expires_at) ?? null,
        protocolVersion: isV2 ? 'ENSv2' : 'ENSv1',
        subdomainCount: row.subname_count,
        recordCount: row.record_count,
        roleBitmap: isV2 ? registryRoleBitmap(row, address) : null,
        v1Roles: isV2 ? null : v1RolesFromRelations(row),
        relations: row.relations,
      }
    })
