/**
 * Portal-side presentation of the `PermissionedResolver` role model.
 *
 * The bit layout, the setter-scope resources and the calldata `grantSetterRoles`
 * takes all live in `@ensdomains/ensjs/utils/v2`; this module only adds what the
 * UI needs on top: titles and descriptions for the permission list, a readable
 * label for an EAC resource, and grouping role rows by account and scope.
 */

import {
  computeResolverResource,
  decodeResolverRoleBitmap,
  type ResolverRole,
  type ResolverSetterScope,
} from '@ensdomains/ensjs/utils/v2'
import { toHex } from 'viem'
import {
  type ResourceId,
  ROOT_RESOURCE_ID,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'

export {
  computeResolverResource,
  decodeResolverRoleBitmap,
  encodeResolverRoleBitmap,
  encodeResolverSetterScope,
  resolverSetterScopeRole,
} from '@ensdomains/ensjs/utils/v2'
export type { ResolverRole, ResolverSetterScope }

/** A role a user can be granted from the UI, admin variants excluded. */
export type ResolverPermissionKey = Exclude<ResolverRole, `${string}_ADMIN`>

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

/**
 * The EAC resource covering every name on the resolver.
 *
 * An explicit constant, and the only way to name root scope in this module.
 * No conversion here returns it: an unreadable resource comes back as `null`,
 * because widening "I could not read this" into "everything" is how a grant
 * meant for one scope lands on all of them (WEB-1513).
 */
export const ROOT_RESOURCE: ResourceId = ROOT_RESOURCE_ID
export const ROOT_RESOURCE_LABEL = 'All names'

/** Human label for a setter scope. */
export const formatSetterScope = (scope: ResolverSetterScope): string => {
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
 * Setter arguments common enough to label without the `ResourceArgument` event.
 * Anything else shows as a truncated resource hash.
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

let knownResourceLabels: Map<bigint, string> | undefined

const buildKnownResourceLabels = (): Map<bigint, string> => {
  const map = new Map<bigint, string>()
  for (const key of KNOWN_TEXT_KEYS) {
    const scope: ResolverSetterScope = { kind: 'text', key }
    map.set(computeResolverResource(scope), formatSetterScope(scope))
  }
  for (const coinType of KNOWN_COIN_TYPES) {
    const scope: ResolverSetterScope = { kind: 'address', coinType }
    map.set(computeResolverResource(scope), formatSetterScope(scope))
  }
  return map
}

/**
 * A resource preimage the resolver revealed through `ResourceArgument`, as the
 * indexer decodes it. Labels any scoped grant, not just the well-known keys.
 */
export type ResourceArgumentLabel = {
  readonly resource: string
  readonly recordKind: string | null
  readonly recordKey: string | null
  readonly coinType: string | null
}

/** The label for one revealed preimage, or null when it carries no argument. */
const labelForNamedResource = (entry: ResourceArgumentLabel): string | null => {
  if (entry.recordKind === 'addr')
    return entry.coinType ? `address (coin type ${entry.coinType})` : null
  if (!entry.recordKey) return null
  return `${entry.recordKind ?? 'record'} "${entry.recordKey}"`
}

/** Build a resource -> label lookup from the indexer's revealed preimages. */
export const buildResourceLabels = (
  named: readonly ResourceArgumentLabel[],
): Map<bigint, string> => {
  const map = new Map<bigint, string>()
  for (const entry of named) {
    const label = labelForNamedResource(entry)
    if (!label) continue
    try {
      map.set(BigInt(entry.resource), label)
    } catch {
      // A resource the indexer could not normalise; fall back to the hash.
    }
  }
  return map
}

/**
 * Label for an EAC resource: root, a revealed setter argument, a well-known
 * one, or its truncated hash.
 */
export const describeResolverResource = (
  resource: bigint | string,
  revealed?: ReadonlyMap<bigint, string>,
): string => {
  const value = typeof resource === 'string' ? BigInt(resource) : resource
  if (value === ROOT_RESOURCE) return ROOT_RESOURCE_LABEL
  const fromChain = revealed?.get(value)
  if (fromChain) return fromChain
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
  /** EAC resource the roles are held on, as a decimal string (row identity). */
  readonly resource: string
  /**
   * The same resource, typed, for the save path to carry straight into
   * calldata instead of re-parsing the string above (WEB-1513).
   */
  readonly resourceId: ResourceId
  readonly isRoot: boolean
  readonly resourceLabel: string
  readonly roles: readonly T[]
  readonly decodedRoles: readonly ResolverRole[]
}

/**
 * Null when the indexer hands back a resource we cannot parse. Coercing it to
 * `ROOT_RESOURCE` would merge the row into the account's root grant, and
 * revoking from that row would then target root roles.
 */
const normalizeResource = (resource: string): ResourceId | null =>
  resourceIdFromChainValue(resource).unwrapOr(null)

/**
 * Groups resolver roles by account and resource. One row per grant scope,
 * because a root grant and an argument grant on the same account are managed
 * with different calls.
 */
export const groupRolesByAccount = <T extends RoleInput>(
  roles: readonly T[],
  revealed?: ReadonlyMap<bigint, string>,
): AccountRoleGroup<T>[] => {
  const grouped = new Map<
    string,
    {
      account: string
      resource: ResourceId
      roles: T[]
      decodedRoles: ResolverRole[]
    }
  >()

  for (const role of roles) {
    const account = role.account.toLowerCase()
    const resource = normalizeResource(role.resource)
    if (resource === null) continue
    const decoded = decodeResolverRoleBitmap(BigInt(role.roleBitmap))
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
    resourceId: g.resource,
    isRoot: g.resource === ROOT_RESOURCE,
    resourceLabel: describeResolverResource(g.resource, revealed),
    roles: g.roles,
    decodedRoles: g.decodedRoles,
  }))
}

/**
 * Stable identity of a grouped row: one account on one resource. Table rows,
 * the open editor and its draft all key on this, never on a row's position.
 */
export const resolverRoleGroupId = ({
  account,
  resource,
}: Pick<AccountRoleGroup, 'account' | 'resource'>): string =>
  `${account.toLowerCase()}:${resource}`

/** One revoke call: every role `account` holds on one resource. */
export type ResolverRevocation = {
  readonly resource: ResourceId
  readonly resourceLabel: string
  readonly roles: readonly ResolverRole[]
}

/**
 * What "Remove user" has to send to take every role away from `account`: one
 * revocation per resource it holds, root included. `unreadable` when one of
 * its grants has a resource we can't parse, since no revoke could name it and
 * the removal would leave that grant behind.
 */
export type AccountRemovalPlan =
  | {
      readonly type: 'complete'
      readonly revocations: readonly ResolverRevocation[]
    }
  | { readonly type: 'unreadable' }

export const planAccountRemoval = <T extends RoleInput>(
  roles: readonly T[],
  account: string,
  revealed?: ReadonlyMap<bigint, string>,
): AccountRemovalPlan => {
  const target = account.toLowerCase()
  const held = roles.filter((role) => role.account.toLowerCase() === target)

  if (held.some((role) => normalizeResource(role.resource) === null))
    return { type: 'unreadable' }

  const revocations = groupRolesByAccount(held, revealed)
    .filter((group) => group.decodedRoles.length > 0)
    .map((group) => ({
      // Carried from the group, not re-parsed from its string form.
      resource: group.resourceId,
      resourceLabel: group.resourceLabel,
      roles: group.decodedRoles,
    }))
    // Root first, so the widest grant is the first one taken away.
    .toSorted(
      (a, b) =>
        Number(b.resource === ROOT_RESOURCE) -
        Number(a.resource === ROOT_RESOURCE),
    )

  return { type: 'complete', revocations }
}
