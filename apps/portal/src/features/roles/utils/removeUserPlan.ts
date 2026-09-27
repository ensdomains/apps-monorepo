/**
 * What the roles sidebar's "Remove user" is allowed to revoke.
 *
 * The button used to pass the row's raw decoded role list straight to
 * `revokeRoles`. For a `.eth` 2LD that list includes the `_ADMIN` roles the
 * sheet never displays, and two of them are traps:
 *
 * - `ROLE_CAN_TRANSFER_ADMIN` is checked on the *token owner* by
 *   `PermissionedRegistry._update`, which reverts `TransferDisallowed` without
 *   it. `EnhancedAccessControl._getSettableRoles` only lets an account grant
 *   roles it holds the `_ADMIN` for, and this role has no regular counterpart,
 *   so once its last holder loses it nobody can grant it back — the name cannot
 *   be transferred or sold for the rest of its term.
 * - Any other `_ADMIN` role whose last holder this account is goes the same way:
 *   unrecoverable, though it costs a power rather than the whole name.
 *
 * Revoking is gated by the same settable-roles rule, so a caller that holds no
 * `_ADMIN` for a role cannot revoke it either — and because the registry checks
 * the whole bitmap at once, including one such role reverts the entire removal
 * instead of removing the rest.
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import {
  getRemovableRoles,
  getSoleAdminRoles,
} from '@/features/registry/utils/registryRoleAccess'

/** One row of a name's `account -> roles` state, as `getNameRolesAccounts` returns it. */
export type NameRoleHolder = {
  readonly account: Address
  readonly roles: readonly Role[]
}

/** Only ever held as an admin role, and checked on the token owner, not the caller. */
const TRANSFER_ROLE: Role = 'ROLE_CAN_TRANSFER_ADMIN'

export type RemoveUserPlan = {
  /** The roles the revoke transaction encodes. */
  readonly rolesToRevoke: readonly Role[]
  /** Kept back: this account is the last transfer admin, so revoking freezes the name. */
  readonly frozenRoles: readonly Role[]
  /** Kept back: the caller holds no `_ADMIN` for them, so revoking would revert. */
  readonly unauthorizedRoles: readonly Role[]
  /** In `rolesToRevoke`, but this account is their last admin — nobody can grant them back. */
  readonly lockoutRoles: readonly Role[]
}

const isSameAccount = (a: Address, b: Address) =>
  a.toLowerCase() === b.toLowerCase()

type BuildRemoveUserPlanParameters = {
  /** The account whose row is being removed. */
  readonly account: Address | undefined
  /** That account's current roles on the name. */
  readonly currentRoles: readonly Role[]
  /** The connected wallet's `_ADMIN` roles on the name. */
  readonly callerAdminRoles: ReadonlySet<Role>
  /** Every account holding roles on the name, including `account`'s own row. */
  readonly holders: readonly NameRoleHolder[] | undefined
}

/**
 * Split `currentRoles` into what Remove user revokes and what it must keep.
 *
 * The three kept/revoked buckets are disjoint and preserve `currentRoles` order.
 * Holders are the name's own grants, so an `_ADMIN` role held at the registry
 * root — which `EnhancedAccessControl` ORs in, and which could therefore restore
 * a revoked role — reads as sole here. That errs towards keeping a role we could
 * have safely revoked, which is the harmless direction.
 */
export const buildRemoveUserPlan = ({
  account,
  currentRoles,
  callerAdminRoles,
  holders,
}: BuildRemoveUserPlanParameters): RemoveUserPlan => {
  // Unknown holders must not read as "someone else can restore it": default to
  // freezing the transfer role unless another holder is positively confirmed.
  const hasOtherTransferAdmin = Boolean(
    account &&
      holders?.some(
        (holder) =>
          !isSameAccount(holder.account, account) &&
          holder.roles.includes(TRANSFER_ROLE),
      ),
  )

  const frozen = new Set<Role>(
    hasOtherTransferAdmin
      ? []
      : currentRoles.filter((role) => role === TRANSFER_ROLE),
  )

  const removable = new Set(getRemovableRoles(currentRoles, callerAdminRoles))
  const soleAdminRoles = getSoleAdminRoles(holders, account)

  const rolesToRevoke = currentRoles.filter(
    (role) => removable.has(role) && !frozen.has(role),
  )

  return {
    rolesToRevoke,
    frozenRoles: [...frozen],
    unauthorizedRoles: currentRoles.filter(
      (role) => !removable.has(role) && !frozen.has(role),
    ),
    lockoutRoles: rolesToRevoke.filter((role) => soleAdminRoles.has(role)),
  }
}
