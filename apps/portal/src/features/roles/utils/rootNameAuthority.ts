import type { Role } from '@ensdomains/ensjs/utils/v2'

/**
 * The root-held roles that are authority over an individual name.
 *
 * A role held at `ROOT_RESOURCE` applies to every resource in the registry,
 * because `EnhancedAccessControl` ORs an account's root roles with its
 * per-resource ones. Only the roles below act on a name; the rest of the root
 * set (registrar, register-reserved, set-parent, set-uri, can-name, upgrade)
 * governs the registry itself and says nothing about who can touch this name.
 *
 * `ROLE_CAN_TRANSFER_ADMIN` is deliberately absent even though a registry root
 * can report holders for it. The transfer gate checks that role on the token's
 * owner, not on the caller, and ERC-1155 still requires the caller to be that
 * owner or an approved operator, so a root holder has no power over anyone
 * else's token. `hasRoles` still answers true for them through the root OR,
 * which makes a capability read misleading here.
 *
 * `ROLE_RENEW` is absent too, for the opposite reason: renewal can only extend
 * an expiry, never shorten it, so a root holder having it is not authority
 * against the owner. The `.eth` registry root holds it, so including it would
 * put ENS's renewal controllers on every 2LD's page and bury the roles that
 * actually matter.
 */
const NAME_AUTHORITY_ROLES = [
  'ROLE_UNREGISTER',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_SUBREGISTRY',
] as const satisfies readonly Role[]

export type RootNameAuthority = {
  readonly role: (typeof NAME_AUTHORITY_ROLES)[number]
  /** How many accounts hold it at the registry root. */
  readonly holders: number
}

/**
 * Which registry-root roles currently have holders, from the registry's packed
 * assignee counter. Empty when nobody holds authority over the name this way,
 * which is the case for a `.eth` 2LD.
 */
export const rootNameAuthority = (
  counts: Readonly<Partial<Record<string, number>>> | undefined,
): readonly RootNameAuthority[] =>
  NAME_AUTHORITY_ROLES.map((role) => ({
    role,
    holders: counts?.[role] ?? 0,
  })).filter(({ holders }) => holders > 0)
