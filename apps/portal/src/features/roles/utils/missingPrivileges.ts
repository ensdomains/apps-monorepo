import type { Role } from '@ensdomains/ensjs/utils/v2'
import { type Address, isAddressEqual } from 'viem'

/**
 * Warnings for token roles a name's owner lacks (contracts-v2#432).
 *
 * Every check reads the roles granted on the name's own token. Roles granted
 * at the registry root are deliberately ignored: they belong to whoever runs
 * the registry, don't move with the token, and the transfer gate stopped
 * honouring them in contracts-v2#433. A name whose owner can only act through
 * root roles has still lost those powers at the token level.
 */

/** `account -> roles` on the name's token, as `getNameRolesAccounts` reads it. */
export type TokenRoleHolders = ReadonlyMap<Address, readonly Role[]>

export type TransferWarning =
  /** The owner lacks `ROLE_CAN_TRANSFER_ADMIN`, so a transfer reverts. */
  | { readonly kind: 'cannot-transfer' }
  /** Another account holds roles on the token, and keeps them after a transfer. */
  | { readonly kind: 'cannot-transfer-safely' }

export type SetterWarning =
  /** The owner holds neither the role nor its admin, so nobody can change the slot. */
  | { readonly kind: 'locked'; readonly missing: readonly [Role, Role] }
  /** The owner can change the slot but can't grant that power to anyone else. */
  | { readonly kind: 'cannot-grant'; readonly missing: readonly [Role] }

const TRANSFER_ROLE: Role = 'ROLE_CAN_TRANSFER_ADMIN'

const getOwnerRoles = (
  holders: TokenRoleHolders,
  owner: Address,
): readonly Role[] =>
  [...holders].find(([account]) => isAddressEqual(account, owner))?.[1] ?? []

const getSetterWarning = (
  roles: readonly Role[],
  role: Role,
  admin: Role,
): SetterWarning | null => {
  if (roles.includes(admin)) return null
  if (roles.includes(role)) return { kind: 'cannot-grant', missing: [admin] }
  return { kind: 'locked', missing: [role, admin] }
}

export const getTransferWarning = ({
  owner,
  holders,
}: {
  readonly owner: Address
  readonly holders: TokenRoleHolders
}): TransferWarning | null => {
  if (!getOwnerRoles(holders, owner).includes(TRANSFER_ROLE))
    return { kind: 'cannot-transfer' }

  const hasOtherHolders = [...holders].some(
    ([account, roles]) => !isAddressEqual(account, owner) && roles.length > 0,
  )
  return hasOtherHolders ? { kind: 'cannot-transfer-safely' } : null
}

export const getResolverWarning = ({
  owner,
  holders,
}: {
  readonly owner: Address
  readonly holders: TokenRoleHolders
}): SetterWarning | null =>
  getSetterWarning(
    getOwnerRoles(holders, owner),
    'ROLE_SET_RESOLVER',
    'ROLE_SET_RESOLVER_ADMIN',
  )

/**
 * A locked migrated name points at its canonical WrapperRegistry and is
 * expected to have no subregistry roles, so that is not a warning.
 */
export const getSubregistryWarning = ({
  owner,
  holders,
  subregistry,
  wrapperRegistry,
}: {
  readonly owner: Address
  readonly holders: TokenRoleHolders
  readonly subregistry: Address
  /** The canonical WrapperRegistry for this name, if it has one. */
  readonly wrapperRegistry: Address | null
}): SetterWarning | null => {
  if (wrapperRegistry && isAddressEqual(subregistry, wrapperRegistry))
    return null

  return getSetterWarning(
    getOwnerRoles(holders, owner),
    'ROLE_SET_SUBREGISTRY',
    'ROLE_SET_SUBREGISTRY_ADMIN',
  )
}
