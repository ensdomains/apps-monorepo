/**
 * Permission definitions based on RegistryRolesLib contract constants
 * @see https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/registry/libraries/RegistryRolesLib.sol
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'

type PermissionKey = Exclude<Role, `${string}_ADMIN`>

type Permission = {
  key: PermissionKey
  title: string
  description: string
}

export const permissions: Permission[] = [
  {
    key: 'ROLE_RENEW',
    title: 'Renew',
    description: 'Can renew name registrations',
  },
  {
    key: 'ROLE_SET_SUBREGISTRY',
    title: 'Set Subregistry',
    description: 'Can change subregistry addresses',
  },
  {
    key: 'ROLE_SET_RESOLVER',
    title: 'Set Resolver',
    description: 'Can change the resolver addresses',
  },
  {
    key: 'ROLE_UNREGISTER',
    title: 'Unregister',
    description: 'Can unregister (delete) the name',
  },
] as const

const nonSettableManagerRoles = new Set<Role>(['ROLE_REGISTRAR', 'ROLE_RENEW'])

export const isManagerRoleSettable = (role: Role) =>
  !nonSettableManagerRoles.has(role)
