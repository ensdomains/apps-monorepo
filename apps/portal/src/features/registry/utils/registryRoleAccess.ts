/**
 * Pure helpers for reasoning about registry root-resource role assignments.
 *
 * All functions operate on the `RootRoleHolder[]` returned by
 * `getRegistryRootRoleHoldersQueryOptions` (one row per account, listing the
 * roles it holds at the registry root, `_ADMIN` variants included). Kept pure and
 * framework-free so the add/edit-user sheets share them and they're unit-tested
 * in isolation.
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import type { RootRoleHolder } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { isRegistryRole } from '@/lib/roles/permissions'

const ADMIN_SUFFIX = '_ADMIN'

export const isAdminRole = (role: Role): boolean => role.endsWith(ADMIN_SUFFIX)

/** The `_ADMIN` counterpart of a role (returns the role unchanged if already admin). */
export const toAdminRole = (role: Role): Role =>
  isAdminRole(role) ? role : (`${role}${ADMIN_SUFFIX}` as Role)

/** Roles held by `account` at the registry root (case-insensitive). */
const rolesForAccount = (
  rows: readonly RootRoleHolder[] | undefined,
  account: Address | undefined,
): readonly Role[] => {
  if (!rows || !account) return []
  const target = account.toLowerCase()
  return (
    rows
      .find((row) => row.account.toLowerCase() === target)
      ?.roles.filter(isRegistryRole) ?? []
  )
}

/**
 * Subset of `currentRoles` whose `_ADMIN` counterpart is in `callerAdminRoles`
 * — i.e. the roles the caller is permitted to revoke.
 */
export const getRemovableRoles = (
  currentRoles: readonly Role[],
  callerAdminRoles: ReadonlySet<Role>,
): Role[] =>
  currentRoles.filter((role) => callerAdminRoles.has(toAdminRole(role)))

/**
 * The `_ADMIN` roles `account` is the *sole* holder of across `rows` — revoking
 * any of these removes the last admin for that role (a lockout).
 */
export const getSoleAdminRoles = (
  rows: readonly RootRoleHolder[] | undefined,
  account: Address | undefined,
): Set<Role> => {
  if (!rows || !account) return new Set()
  const target = account.toLowerCase()
  const result = new Set<Role>()
  for (const role of rolesForAccount(rows, account)) {
    if (!isAdminRole(role)) continue
    const hasOtherHolder = rows.some(
      (row) => row.account.toLowerCase() !== target && row.roles.includes(role),
    )
    if (!hasOtherHolder) result.add(role)
  }
  return result
}

const UPGRADE_ROLES: readonly Role[] = ['ROLE_UPGRADE', 'ROLE_UPGRADE_ADMIN']

/** On a UserRegistry pending an upgrade (or unverified), refuse an edit after which no one could upgrade it. */
export const isUpgradeRevokeBlocked = ({
  isPendingUpgrade,
  rootRoleCounts,
  accountRoles,
  toGrant,
  toRevoke,
}: {
  readonly isPendingUpgrade: boolean | undefined
  /** On-chain holder count per root role; undefined while unknown. */
  readonly rootRoleCounts: Readonly<Record<string, number>> | undefined
  /** The edited account's on-chain root roles; undefined while unknown. */
  readonly accountRoles: readonly Role[] | undefined
  readonly toGrant: readonly Role[]
  readonly toRevoke: readonly Role[]
}): boolean => {
  if (
    isPendingUpgrade === false ||
    !toRevoke.some((role) => UPGRADE_ROLES.includes(role))
  )
    return false
  if (!rootRoleCounts || !accountRoles) return true
  const remaining = (role: Role) => {
    const holds = accountRoles.includes(role)
    const keeps = toGrant.includes(role) || (holds && !toRevoke.includes(role))
    return (rootRoleCounts[role] ?? 0) - (holds ? 1 : 0) + (keeps ? 1 : 0)
  }
  return UPGRADE_ROLES.every((role) => remaining(role) === 0)
}

/** Roles to grant/revoke to move a holder from `current` to `selected`. */
export const computeRoleDiff = (
  current: ReadonlySet<Role>,
  selected: ReadonlySet<Role>,
): { toGrant: Role[]; toRevoke: Role[] } => {
  const toGrant: Role[] = []
  const toRevoke: Role[] = []
  for (const role of selected) if (!current.has(role)) toGrant.push(role)
  for (const role of current) if (!selected.has(role)) toRevoke.push(role)
  return { toGrant, toRevoke }
}
