/**
 * Permission definitions based on RegistryRolesLib contract constants
 * @see https://github.com/ensdomains/namechain/blob/429e873130a4985da99b42050817b77745b90381/contracts/src/common/registry/libraries/RegistryRolesLib.sol
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'

export type PermissionKey = Exclude<Role, `${string}_ADMIN`>

export type Permission = {
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
    key: 'ROLE_SET_TOKEN_OBSERVER',
    title: 'Set Token Observer',
    description: 'Can set token observer contracts',
  },
  {
    key: 'ROLE_BURN',
    title: 'Burn',
    description: 'Can burn (delete) the name',
  },
] as const

// Helper to get permission by key
export const getPermissionByKey = (
  key: PermissionKey,
): Permission | undefined => {
  return permissions.find((p) => p.key === key)
}

// Helper to get all permission keys
export const getPermissionKeys = (): PermissionKey[] => {
  return permissions.map((p) => p.key)
}
