import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { RootRoleHolder } from '@/features/roles/hooks/useRegistryRootRoleHolders'

/**
 * The root-held powers that can act against a name's owner.
 *
 * A role held at `ROOT_RESOURCE` applies to every resource in the registry,
 * because `EnhancedAccessControl` ORs an account's root roles with its
 * per-resource ones. Only the powers below act on a name; the rest of the root
 * set (registrar, register-reserved, set-parent, set-uri, can-name, upgrade)
 * governs the registry itself and says nothing about who can touch this name.
 *
 * Each power counts the regular role or its `_ADMIN` variant. Holding the admin
 * variant at root is the same authority in practice: it authorises granting the
 * regular role, and root holders are exempt from the registry's rule that only
 * regular roles may be granted on a registered name, so an admin can hand
 * itself the power whenever it likes.
 *
 * `ROLE_CAN_TRANSFER_ADMIN` is deliberately absent. The transfer gate checks
 * that role on the token's owner, not on the caller, and ERC-1155 still
 * requires the caller to be that owner or an approved operator, so a root
 * holder has no power over anyone else's token. `hasRoles` still answers true
 * for them through the root OR, which makes a capability read misleading here.
 *
 * `ROLE_RENEW` is absent for the opposite reason: renewal can only extend an
 * expiry, never shorten it, so it is not authority against the owner. The
 * `.eth` registry root holds it, so including it would put ENS's renewal
 * controllers on every 2LD's page and bury the powers that matter.
 */
const NAME_AUTHORITY: readonly {
  readonly power: Role
  readonly admin: Role
}[] = [
  { power: 'ROLE_UNREGISTER', admin: 'ROLE_UNREGISTER_ADMIN' },
  { power: 'ROLE_SET_RESOLVER', admin: 'ROLE_SET_RESOLVER_ADMIN' },
  { power: 'ROLE_SET_SUBREGISTRY', admin: 'ROLE_SET_SUBREGISTRY_ADMIN' },
]

export type RootAuthorityHolder = {
  readonly account: RootRoleHolder['account']
  /** The powers this account can exercise over the name, by regular role name. */
  readonly powers: readonly Role[]
}

/**
 * Narrow registry-root holders to those who can act against this name, and to
 * the powers that do so. Empty when nobody can, which is the case for a `.eth`
 * 2LD.
 */
export const rootNameAuthority = (
  holders: readonly RootRoleHolder[] | undefined,
): readonly RootAuthorityHolder[] =>
  (holders ?? [])
    .map(({ account, roles }) => ({
      account,
      powers: NAME_AUTHORITY.filter(
        ({ power, admin }) => roles.includes(power) || roles.includes(admin),
      ).map(({ power }) => power),
    }))
    .filter(({ powers }) => powers.length > 0)
