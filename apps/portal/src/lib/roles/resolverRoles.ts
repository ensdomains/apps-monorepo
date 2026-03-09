/**
 * Resolver EAC role definitions.
 * Same nybble-packed bitmap format as registry roles, but with
 * resolver-specific meanings at each bit position.
 *
 * Bit positions (manager):
 *   1 << 0   ROLE_SET_ADDR
 *   1 << 4   ROLE_SET_TEXT
 *   1 << 8   ROLE_SET_CONTENTHASH
 *   1 << 12  ROLE_SET_PUBKEY
 *   1 << 16  ROLE_SET_ABI
 *   1 << 20  ROLE_SET_INTERFACE
 *   1 << 24  ROLE_SET_NAME
 *   1 << 28  ROLE_SET_ALIAS
 *   1 << 32  ROLE_CLEAR
 *   1 << 124 ROLE_UPGRADE
 *
 * Admin bits are at position + 128.
 */

export const resolverRoles = {
  ROLE_SET_ADDR: 1n << 0n,
  ROLE_SET_ADDR_ADMIN: (1n << 0n) << 128n,
  ROLE_SET_TEXT: 1n << 4n,
  ROLE_SET_TEXT_ADMIN: (1n << 4n) << 128n,
  ROLE_SET_CONTENTHASH: 1n << 8n,
  ROLE_SET_CONTENTHASH_ADMIN: (1n << 8n) << 128n,
  ROLE_SET_PUBKEY: 1n << 12n,
  ROLE_SET_PUBKEY_ADMIN: (1n << 12n) << 128n,
  ROLE_SET_ABI: 1n << 16n,
  ROLE_SET_ABI_ADMIN: (1n << 16n) << 128n,
  ROLE_SET_INTERFACE: 1n << 20n,
  ROLE_SET_INTERFACE_ADMIN: (1n << 20n) << 128n,
  ROLE_SET_NAME: 1n << 24n,
  ROLE_SET_NAME_ADMIN: (1n << 24n) << 128n,
  ROLE_SET_ALIAS: 1n << 28n,
  ROLE_SET_ALIAS_ADMIN: (1n << 28n) << 128n,
  ROLE_CLEAR: 1n << 32n,
  ROLE_CLEAR_ADMIN: (1n << 32n) << 128n,
  ROLE_UPGRADE: 1n << 124n,
  ROLE_UPGRADE_ADMIN: (1n << 124n) << 128n,
} as const

export type ResolverRoleKey = keyof typeof resolverRoles

type ResolverPermissionKey = Exclude<ResolverRoleKey, `${string}_ADMIN`>

type ResolverPermission = {
  key: ResolverPermissionKey
  title: string
  description: string
}

export const resolverPermissions: ResolverPermission[] = [
  {
    key: 'ROLE_SET_ADDR',
    title: 'Set Address',
    description: 'Can set address records',
  },
  {
    key: 'ROLE_SET_TEXT',
    title: 'Set Text',
    description: 'Can set text records',
  },
  {
    key: 'ROLE_SET_CONTENTHASH',
    title: 'Set Content Hash',
    description: 'Can set content hash records',
  },
  {
    key: 'ROLE_SET_PUBKEY',
    title: 'Set Pubkey',
    description: 'Can set public key records',
  },
  {
    key: 'ROLE_SET_ABI',
    title: 'Set ABI',
    description: 'Can set ABI records',
  },
  {
    key: 'ROLE_SET_INTERFACE',
    title: 'Set Interface',
    description: 'Can set interface implementer records',
  },
  {
    key: 'ROLE_SET_NAME',
    title: 'Set Name',
    description: 'Can set reverse name records',
  },
  {
    key: 'ROLE_SET_ALIAS',
    title: 'Set Alias',
    description: 'Can set alias mappings',
  },
  {
    key: 'ROLE_CLEAR',
    title: 'Clear',
    description: 'Can clear all versioned records',
  },
  {
    key: 'ROLE_UPGRADE',
    title: 'Upgrade',
    description: 'Can upgrade the resolver contract',
  },
]

/**
 * Decodes a resolver role bitmap into an array of role names.
 */
export const decodeResolverRoleBitmap = (
  bitmap: bigint | string,
): ResolverRoleKey[] => {
  const bitmapValue = typeof bitmap === 'string' ? BigInt(bitmap) : bitmap

  const roles: ResolverRoleKey[] = []

  for (const [roleName, roleValue] of Object.entries(resolverRoles)) {
    if ((bitmapValue & roleValue) !== 0n) {
      roles.push(roleName as ResolverRoleKey)
    }
  }

  return roles
}

type RoleInput = {
  readonly account: string
  readonly roleBitmap: string
}

export type AccountRoleGroup<T extends RoleInput = RoleInput> = {
  readonly account: string
  readonly roles: readonly T[]
  readonly decodedRoles: readonly string[]
}

/**
 * Groups resolver roles by account and decodes each bitmap into
 * human-readable role names in a single pass.
 */
export const groupRolesByAccount = <T extends RoleInput>(
  roles: readonly T[],
): AccountRoleGroup<T>[] => {
  const grouped = new Map<
    string,
    { account: string; roles: T[]; decodedRoles: string[] }
  >()

  for (const role of roles) {
    const account = role.account.toLowerCase()
    const decoded = decodeResolverRoleBitmap(role.roleBitmap)
    const existing = grouped.get(account)

    if (existing) {
      existing.roles.push(role)
      existing.decodedRoles.push(...decoded)
    } else {
      grouped.set(account, {
        account,
        roles: [role],
        decodedRoles: [...decoded],
      })
    }
  }

  return Array.from(grouped.values())
}
