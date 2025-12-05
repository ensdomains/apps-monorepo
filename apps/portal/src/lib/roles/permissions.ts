/**
 * Permission definitions based on RegistryRolesLib contract constants
 * @see https://github.com/ensdomains/namechain/blob/429e873130a4985da99b42050817b77745b90381/contracts/src/common/registry/libraries/RegistryRolesLib.sol
 */

export type PermissionKey =
  | 'REGISTRAR'
  | 'RENEW'
  | 'SET_SUBREGISTRY'
  | 'SET_RESOLVER'
  | 'SET_TOKEN_OBSERVER'
  | 'CAN_TRANSFER' // Note: CAN_TRANSFER_ADMIN in items becomes CAN_TRANSFER in permissions map
  | 'UNREGISTER'

export type Permission = {
  key: PermissionKey
  contractName: string // The exact constant name from the contract
  title: string
  description: string
}

export const permissions: Permission[] = [
  {
    key: 'REGISTRAR',
    contractName: 'ROLE_REGISTRAR',
    title: 'Registrar',
    description: 'Can register new names',
  },
  {
    key: 'RENEW',
    contractName: 'ROLE_RENEW',
    title: 'Renew',
    description: 'Can renew name registrations',
  },
  {
    key: 'SET_SUBREGISTRY',
    contractName: 'ROLE_SET_SUBREGISTRY',
    title: 'Set Subregistry',
    description: 'Can change subregistry addresses',
  },
  {
    key: 'SET_RESOLVER',
    contractName: 'ROLE_SET_RESOLVER',
    title: 'Set Resolver',
    description: 'Can change the resolver addresses',
  },
  {
    key: 'SET_TOKEN_OBSERVER',
    contractName: 'ROLE_SET_TOKEN_OBSERVER',
    title: 'Set Token Observer',
    description: 'Can set token observer contracts',
  },
  {
    key: 'CAN_TRANSFER',
    contractName: 'ROLE_CAN_TRANSFER_ADMIN',
    title: 'Can Transfer',
    description: 'Can grant/revoke transfer admin rights',
  },
  {
    key: 'UNREGISTER',
    contractName: 'ROLE_UNREGISTER',
    title: 'Unregister',
    description: 'Can unregister (delete) the name',
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
