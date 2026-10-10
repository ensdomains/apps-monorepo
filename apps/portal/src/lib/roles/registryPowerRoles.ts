import type { Power, RegistryPower } from '@ens-apps/indexer/bigname'
import type { Role } from '@ensdomains/ensjs/utils/v2'

/**
 * bigname's ENSv2 registry powers, keyed to the ensjs role each one is. The
 * role tables, the role history and the "N Roles" badges all speak ensjs
 * roles, so bigname's powers are folded back into them rather than giving
 * those components a second vocabulary.
 */
const REGISTRY_POWER_ROLES: Readonly<Record<RegistryPower, Role>> = {
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

const isRegistryPower = (power: Power): power is RegistryPower =>
  Object.hasOwn(REGISTRY_POWER_ROLES, power)

/** Registry powers as ensjs roles; powers with no registry role are dropped. */
export const registryPowersToRoles = (powers: readonly Power[]): Role[] =>
  powers.flatMap((power) =>
    isRegistryPower(power) ? [REGISTRY_POWER_ROLES[power]] : [],
  )
