/**
 * What the roles sidebar's "Remove user" is allowed to revoke.
 *
 * The button used to pass the row's raw decoded role list straight to
 * `revokeRoles`. For a `.eth` 2LD that list includes the `_ADMIN` roles the
 * sheet never displays, and two of them are traps:
 *
 * - `ROLE_CAN_TRANSFER_ADMIN` is checked on the *token owner* by
 *   `PermissionedRegistry._update`, which reverts `TransferDisallowed` without
 *   it. Because the gate reads the owner and not the caller, another account
 *   holding the role does not keep the name transferable — so the owner keeps it
 *   however many other holders there are. Revoking the *last* holder is worse
 *   still: `EnhancedAccessControl._getSettableRoles` only lets an account grant
 *   roles it holds the `_ADMIN` for, and this role has no regular counterpart,
 *   so nobody can ever grant it back and the name cannot be transferred or sold
 *   for the rest of its term.
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

/**
 * Why the transfer role is kept. `last-holder` wins over `owner`: it holds even
 * on a non-owner row, and it is the stronger consequence.
 */
export type TransferRoleHold = 'last-holder' | 'owner' | 'owner-unknown'

export type RemoveUserPlan = {
  /** The roles the revoke transaction encodes. */
  readonly rolesToRevoke: readonly Role[]
  /** Kept back: revoking the transfer role would freeze the name. */
  readonly frozenRoles: readonly Role[]
  /** Why `frozenRoles` is non-empty; `null` when it is empty. */
  readonly transferRoleHold: TransferRoleHold | null
  /**
   * Kept back: the caller holds no `_ADMIN` for them that we could confirm, so
   * revoking would revert.
   */
  readonly unauthorizedRoles: readonly Role[]
  /**
   * In `rolesToRevoke`, but this account is their last admin on the name and no
   * root holder is known to grant them back.
   */
  readonly lockoutRoles: readonly Role[]
  /**
   * The registry root's holders couldn't be read, so root authority — the
   * caller's, and anyone's who could restore a revoked role — is unknown.
   */
  readonly isRootAuthorityUnknown: boolean
}

const isSameAccount = (a: Address, b: Address) =>
  a.toLowerCase() === b.toLowerCase()

type BuildRemoveUserPlanParameters = {
  /** The account whose row is being removed. */
  readonly account: Address | undefined
  /** That account's current roles on the name. */
  readonly currentRoles: readonly Role[]
  /**
   * The connected wallet's effective `_ADMIN` roles — those held on the name and
   * those held at the registry root, which `EnhancedAccessControl` ORs in.
   */
  readonly callerAdminRoles: ReadonlySet<Role>
  /** Every account holding roles on the name, including `account`'s own row. */
  readonly holders: readonly NameRoleHolder[] | undefined
  /** The name's token owner — the account the transfer gate reads. */
  readonly ownerAddress: Address | undefined
  /**
   * `_ADMIN` roles held by anyone at the registry root. Root holders can grant on
   * any resource in the registry, so these roles stay restorable after a revoke.
   * `undefined` when the root couldn't be read: unknown, not empty.
   */
  readonly rootAdminRoles: ReadonlySet<Role> | undefined
}

/**
 * Split `currentRoles` into what Remove user revokes and what it must keep.
 *
 * The three kept/revoked buckets are disjoint and preserve `currentRoles` order.
 * Anything still unknown — the holder list, the owner — resolves towards keeping
 * the transfer role, since keeping a role we could have revoked is recoverable
 * and revoking one we shouldn't have is not. Unknown root authority likewise
 * counts as no root holder for the lockout warning, flagged so the copy can say
 * it is unconfirmed rather than certain.
 */
export const buildRemoveUserPlan = ({
  account,
  currentRoles,
  callerAdminRoles,
  holders,
  ownerAddress,
  rootAdminRoles,
}: BuildRemoveUserPlanParameters): RemoveUserPlan => {
  // The gate reads the transfer role on the token owner, so the owner keeps it
  // whoever else holds it. An unknown owner might be this row.
  const isOwnerRow =
    !ownerAddress || !account || isSameAccount(account, ownerAddress)

  const isLastTransferAdmin = !(
    account &&
    holders?.some(
      (holder) =>
        !isSameAccount(holder.account, account) &&
        holder.roles.includes(TRANSFER_ROLE),
    )
  )

  const transferRoleHold: TransferRoleHold | null = !currentRoles.includes(
    TRANSFER_ROLE,
  )
    ? null
    : isLastTransferAdmin
      ? 'last-holder'
      : !isOwnerRow
        ? null
        : ownerAddress
          ? 'owner'
          : 'owner-unknown'

  const frozen = new Set<Role>(transferRoleHold ? [TRANSFER_ROLE] : [])

  const removable = new Set(getRemovableRoles(currentRoles, callerAdminRoles))
  const soleAdminRoles = getSoleAdminRoles(holders, account)

  const rolesToRevoke = currentRoles.filter(
    (role) => removable.has(role) && !frozen.has(role),
  )

  return {
    rolesToRevoke,
    frozenRoles: [...frozen],
    transferRoleHold,
    unauthorizedRoles: currentRoles.filter(
      (role) => !removable.has(role) && !frozen.has(role),
    ),
    // A root holder of the same `_ADMIN` role can grant it back, so being the
    // name's last admin only locks the role out when root has no holder either.
    lockoutRoles: rolesToRevoke.filter(
      (role) => soleAdminRoles.has(role) && !rootAdminRoles?.has(role),
    ),
    isRootAuthorityUnknown: rootAdminRoles === undefined,
  }
}
