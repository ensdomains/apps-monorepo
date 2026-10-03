import type { Role } from '@ensdomains/ensjs/utils/v2'
import { type Address, isAddressEqual } from 'viem'
import { isAdminRole, isRegistryRole } from '@/lib/roles/permissions'
import type { NameRoleGrant, TransferRoleRevocations } from '../types'

/**
 * The role whose holder may revoke `role`, per `EnhancedAccessControl`:
 * `_getRevokableRoles` is `withAdminRolesApplied(effectiveRoles)`, which keeps
 * the caller's admin bits and adds each one's regular counterpart. So a regular
 * role is revocable by whoever holds its `_ADMIN` variant, and an admin role by
 * whoever holds that same admin role.
 *
 * Roles with no `_ADMIN` variant at all (`ROLE_WAS_RESERVED`) map to a name
 * nobody can hold, which is the right answer: they are not revocable.
 */
const revokerRoleFor = (role: string): string =>
  isAdminRole(role) ? role : `${role}_ADMIN`

/**
 * Split the name's third-party grants into what the sender can take away before
 * handing the name over and what will outlive the transfer regardless.
 *
 * The sender's own grant is excluded: they are about to lose the token anyway,
 * and revoking their own roles mid-flow would strip the admin rights the
 * remaining steps run on.
 *
 * The sender's authority is `_effectiveRoles`: their grant on this resource
 * ORed with their grant at the registry root. Both are counted, or a name in a
 * registry the sender owns — where the admin roles are typically held at the
 * root — would report every delegate as permanently attached.
 *
 * Third-party root holders are a different matter and deliberately absent:
 * `accounts` replays per-name grants and a root grant is not one, and a
 * per-name revoke could not remove that authority anyway. The roles page
 * reports them under its own heading.
 */
export const planRoleRevocations = ({
  accounts,
  owner,
  ownerRoles,
  ownerRootRoles,
}: {
  /**
   * Current `account -> roles[]` on the name's registry resource. Typed as raw
   * strings because that is how the indexed read hands them over; anything that
   * doesn't name a registry role is dropped rather than encoded into a bitmap.
   */
  readonly accounts: ReadonlyMap<Address, readonly string[]>
  readonly owner: Address
  /** The sender's roles on this name's resource. */
  readonly ownerRoles: readonly string[]
  /** The sender's roles at the registry root, which apply here too. */
  readonly ownerRootRoles: readonly string[]
}): Extract<TransferRoleRevocations, { status: 'ready' }> => {
  const canRevoke = new Set<string>([...ownerRoles, ...ownerRootRoles])

  const holders: NameRoleGrant[] = []
  const revocable: NameRoleGrant[] = []
  const unrevocable: NameRoleGrant[] = []

  for (const [account, rawRoles] of accounts) {
    const roles: Role[] = rawRoles.filter(isRegistryRole)
    if (roles.length === 0 || isAddressEqual(account, owner)) continue

    holders.push({ account, roles })

    // Split per role, not per account: a grant can mix roles the sender admins
    // with ones it doesn't, and revoking the whole bitmap would revert on the
    // ones it doesn't — taking the revocable half down with it.
    const mine = roles.filter((role) => canRevoke.has(revokerRoleFor(role)))
    const theirs = roles.filter((role) => !canRevoke.has(revokerRoleFor(role)))

    if (mine.length > 0) revocable.push({ account, roles: mine })
    if (theirs.length > 0) unrevocable.push({ account, roles: theirs })
  }

  return { status: 'ready', holders, revocable, unrevocable }
}
