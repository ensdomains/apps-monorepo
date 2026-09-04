/**
 * Resolver EAC role definitions for the post-audit-2 `PermissionedResolver`
 * (contracts-v2 PR #417, `PermissionedResolverLib`).
 *
 * Same nybble-packed bitmap format as registry roles. Bit positions:
 *   1 << 0    ROLE_SET_ADDRESS      (root or per coin type)
 *   1 << 4    ROLE_SET_TEXT         (root or per text key)
 *   1 << 8    ROLE_SET_CONTENTHASH  (root only)
 *   1 << 12   ROLE_SET_ABI          (root or per content type)
 *   1 << 16   ROLE_SET_INTERFACE    (root or per interface id)
 *   1 << 20   ROLE_SET_NAME         (root only)
 *   1 << 24   ROLE_SET_DATA         (root or per data key)
 *   1 << 28   ROLE_LINK             (root only)
 *   1 << 120  ROLE_CAN_NAME         (root only)
 *   1 << 124  ROLE_UPGRADE          (root only)
 *
 * Admin bits are at position + 128. Resources are either `ROOT_RESOURCE` (every
 * name on the resolver) or `keccak256(argument)` for one setter argument; there
 * is no per-name scope any more.
 */

import {
  encodeFunctionData,
  type Hex,
  keccak256,
  stringToHex,
  toHex,
} from 'viem'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'

export const resolverRoles = {
  ROLE_SET_ADDRESS: 1n << 0n,
  ROLE_SET_ADDRESS_ADMIN: (1n << 0n) << 128n,
  ROLE_SET_TEXT: 1n << 4n,
  ROLE_SET_TEXT_ADMIN: (1n << 4n) << 128n,
  ROLE_SET_CONTENTHASH: 1n << 8n,
  ROLE_SET_CONTENTHASH_ADMIN: (1n << 8n) << 128n,
  ROLE_SET_ABI: 1n << 12n,
  ROLE_SET_ABI_ADMIN: (1n << 12n) << 128n,
  ROLE_SET_INTERFACE: 1n << 16n,
  ROLE_SET_INTERFACE_ADMIN: (1n << 16n) << 128n,
  ROLE_SET_NAME: 1n << 20n,
  ROLE_SET_NAME_ADMIN: (1n << 20n) << 128n,
  ROLE_SET_DATA: 1n << 24n,
  ROLE_SET_DATA_ADMIN: (1n << 24n) << 128n,
  ROLE_LINK: 1n << 28n,
  ROLE_LINK_ADMIN: (1n << 28n) << 128n,
  ROLE_CAN_NAME: 1n << 120n,
  ROLE_CAN_NAME_ADMIN: (1n << 120n) << 128n,
  ROLE_UPGRADE: 1n << 124n,
  ROLE_UPGRADE_ADMIN: (1n << 124n) << 128n,
} as const

export type ResolverRoleKey = keyof typeof resolverRoles

export type ResolverPermissionKey = Exclude<ResolverRoleKey, `${string}_ADMIN`>

type ResolverPermission = {
  key: ResolverPermissionKey
  title: string
  description: string
}

export const resolverPermissions: ResolverPermission[] = [
  {
    key: 'ROLE_SET_ADDRESS',
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
    key: 'ROLE_SET_DATA',
    title: 'Set Data',
    description: 'Can set data records',
  },
  {
    key: 'ROLE_LINK',
    title: 'Link',
    description: 'Can link names to shared records',
  },
  {
    key: 'ROLE_CAN_NAME',
    title: 'Name Contract',
    description: 'Can set the contract name of this resolver',
  },
  {
    key: 'ROLE_UPGRADE',
    title: 'Upgrade',
    description: 'Can upgrade the resolver contract',
  },
]

/** Bitmap the deploy flow grants the deployer: every role and every admin. */
export const ALL_RESOLVER_ROLES =
  0x1111111111111111111111111111111111111111111111111111111111111111n

export const encodeResolverRoleBitmap = (
  roles: readonly ResolverRoleKey[],
): bigint => roles.reduce((acc, role) => acc | resolverRoles[role], 0n)

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

export const ROOT_RESOURCE = 0n
export const ROOT_RESOURCE_HEX =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

/**
 * One setter argument a role can be narrowed to. Mirrors the setters
 * `PermissionedResolver.decodeSetter` understands.
 */
export type SetterScope =
  | { readonly kind: 'address'; readonly coinType: bigint }
  | { readonly kind: 'text'; readonly key: string }
  | { readonly kind: 'data'; readonly key: string }
  | { readonly kind: 'abi'; readonly contentType: bigint }
  | { readonly kind: 'interface'; readonly interfaceId: Hex }

/** Role a setter scope narrows. */
export const setterScopeRole = (scope: SetterScope): ResolverPermissionKey => {
  switch (scope.kind) {
    case 'address':
      return 'ROLE_SET_ADDRESS'
    case 'text':
      return 'ROLE_SET_TEXT'
    case 'data':
      return 'ROLE_SET_DATA'
    case 'abi':
      return 'ROLE_SET_ABI'
    case 'interface':
      return 'ROLE_SET_INTERFACE'
  }
}

/**
 * EAC resource for a setter argument. Mirrors
 * `PermissionedResolverLib.resource(uint256 | string | bytes4)`:
 * `keccak256(abi.encodePacked(argument))`.
 */
export const computeSetterResource = (scope: SetterScope): bigint => {
  switch (scope.kind) {
    case 'address':
      return BigInt(keccak256(toHex(scope.coinType, { size: 32 })))
    case 'abi':
      return BigInt(keccak256(toHex(scope.contentType, { size: 32 })))
    case 'text':
    case 'data':
      return BigInt(keccak256(stringToHex(scope.key)))
    case 'interface':
      return BigInt(keccak256(scope.interfaceId))
  }
}

/** Empty DNS-encoded name: the root, which `grantSetterRoles` ignores anyway. */
const ROOT_DNS_NAME = '0x00' as const

/**
 * Setter calldata for `grantSetterRoles(setter, account)`. The contract only
 * reads the selector and the argument, so the name and value are placeholders.
 */
export const encodeSetterScope = (scope: SetterScope): Hex => {
  switch (scope.kind) {
    case 'address':
      return encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setAddress',
        args: [ROOT_DNS_NAME, scope.coinType, '0x'],
      })
    case 'text':
      return encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setText',
        args: [ROOT_DNS_NAME, scope.key, ''],
      })
    case 'data':
      return encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setData',
        args: [ROOT_DNS_NAME, scope.key, '0x'],
      })
    case 'abi':
      return encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setABI',
        args: [ROOT_DNS_NAME, scope.contentType, '0x'],
      })
    case 'interface':
      return encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'setInterface',
        args: [
          ROOT_DNS_NAME,
          scope.interfaceId,
          '0x0000000000000000000000000000000000000000',
        ],
      })
  }
}

/** Human label for a setter scope. */
export const formatSetterScope = (scope: SetterScope): string => {
  switch (scope.kind) {
    case 'address':
      return `address (coin type ${scope.coinType})`
    case 'text':
      return `text "${scope.key}"`
    case 'data':
      return `data "${scope.key}"`
    case 'abi':
      return `ABI (content type ${scope.contentType})`
    case 'interface':
      return `interface ${scope.interfaceId}`
  }
}

/**
 * Well-known setter arguments, so a role scoped to one of them can be
 * labelled without the `ResourceArgument` event. Anything else shows as the
 * raw resource hash.
 */
const KNOWN_TEXT_KEYS = [
  'avatar',
  'header',
  'description',
  'display',
  'email',
  'keywords',
  'mail',
  'name',
  'notice',
  'location',
  'phone',
  'url',
  'com.github',
  'com.twitter',
  'com.discord',
  'com.reddit',
  'com.linkedin',
  'org.telegram',
  'io.keybase',
  'eth.ens.delegate',
] as const

const KNOWN_COIN_TYPES = [0n, 2n, 3n, 60n, 118n, 144n, 145n, 501n, 0x80000000n]

const buildKnownResourceLabels = (): Map<bigint, string> => {
  const map = new Map<bigint, string>()
  for (const key of KNOWN_TEXT_KEYS) {
    const scope: SetterScope = { kind: 'text', key }
    map.set(computeSetterResource(scope), formatSetterScope(scope))
  }
  for (const coinType of KNOWN_COIN_TYPES) {
    const scope: SetterScope = { kind: 'address', coinType }
    map.set(computeSetterResource(scope), formatSetterScope(scope))
  }
  return map
}

let knownResourceLabels: Map<bigint, string> | undefined

export const ROOT_RESOURCE_LABEL = 'All names'

/** Label for an EAC resource: root, a known setter argument, or its hash. */
export const describeResolverResource = (resource: bigint | string): string => {
  const value = typeof resource === 'string' ? BigInt(resource) : resource
  if (value === ROOT_RESOURCE) return ROOT_RESOURCE_LABEL
  knownResourceLabels ??= buildKnownResourceLabels()
  const known = knownResourceLabels.get(value)
  if (known) return known
  const hex = toHex(value, { size: 32 })
  return `resource ${hex.slice(0, 10)}…${hex.slice(-4)}`
}

type RoleInput = {
  readonly account: string
  readonly resource: string
  readonly roleBitmap: string
}

export type AccountRoleGroup<T extends RoleInput = RoleInput> = {
  readonly account: string
  /** EAC resource the roles are held on, as a decimal string. */
  readonly resource: string
  readonly isRoot: boolean
  readonly resourceLabel: string
  readonly roles: readonly T[]
  readonly decodedRoles: readonly string[]
}

const normalizeResource = (resource: string): bigint => {
  try {
    return BigInt(resource)
  } catch {
    return ROOT_RESOURCE
  }
}

/**
 * Groups resolver roles by account and resource, decoding bitmaps and
 * labelling the resource (root or setter argument). One row per grant scope,
 * because a root grant and an argument grant on the same account are managed
 * with different calls.
 */
export const groupRolesByAccount = <T extends RoleInput>(
  roles: readonly T[],
): AccountRoleGroup<T>[] => {
  const grouped = new Map<
    string,
    {
      account: string
      resource: bigint
      roles: T[]
      decodedRoles: string[]
    }
  >()

  for (const role of roles) {
    const account = role.account.toLowerCase()
    const resource = normalizeResource(role.resource)
    const decoded = decodeResolverRoleBitmap(role.roleBitmap)
    const groupKey = `${account}:${resource}`

    const existing = grouped.get(groupKey)

    if (existing) {
      existing.roles.push(role)
      existing.decodedRoles.push(...decoded)
    } else {
      grouped.set(groupKey, {
        account,
        resource,
        roles: [role],
        decodedRoles: [...decoded],
      })
    }
  }

  return Array.from(grouped.values()).map((g) => ({
    account: g.account,
    resource: g.resource.toString(),
    isRoot: g.resource === ROOT_RESOURCE,
    resourceLabel: describeResolverResource(g.resource),
    roles: g.roles,
    decodedRoles: g.decodedRoles,
  }))
}
