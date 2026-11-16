import { type Address, isAddressEqual } from 'viem'
import {
  accountsIn,
  type RegistryRepairName,
  type RegistryRepairState,
  type RoleGrant,
  rolesOf,
} from './registryRepairState'

export type RegistryRepairDifference =
  | { readonly kind: 'root-roles'; readonly account: Address }
  | { readonly kind: 'missing-name'; readonly label: string }
  | {
      readonly kind: 'name-field'
      readonly label: string
      readonly field: 'owner' | 'subregistry' | 'resolver' | 'expiry'
    }
  | {
      readonly kind: 'name-roles'
      readonly label: string
      readonly account: Address
    }

const roleDifferences = (
  before: readonly RoleGrant[],
  after: readonly RoleGrant[],
): readonly Address[] =>
  accountsIn([...before, ...after]).filter(
    (account) => rolesOf(before, account) !== rolesOf(after, account),
  )

const NAME_FIELDS = ['owner', 'subregistry', 'resolver', 'expiry'] as const

const isSameField = (
  a: RegistryRepairName,
  b: RegistryRepairName,
  field: (typeof NAME_FIELDS)[number],
): boolean =>
  field === 'expiry'
    ? a.expiry === b.expiry
    : isAddressEqual(a[field], b[field])

/** Everything the copy failed to reproduce; empty when it matches the original exactly. */
export const compareRegistryRepair = (
  before: RegistryRepairState,
  after: RegistryRepairState,
): readonly RegistryRepairDifference[] => [
  ...roleDifferences(before.rootRoles, after.rootRoles).map(
    (account) => ({ kind: 'root-roles', account }) as const,
  ),
  ...before.names.flatMap((name): readonly RegistryRepairDifference[] => {
    const copy = after.names.find((other) => other.label === name.label)
    if (!copy) return [{ kind: 'missing-name', label: name.label }]
    return [
      ...NAME_FIELDS.filter((field) => !isSameField(name, copy, field)).map(
        (field) => ({ kind: 'name-field', label: name.label, field }) as const,
      ),
      ...roleDifferences(name.roles, copy.roles).map(
        (account) =>
          ({ kind: 'name-roles', label: name.label, account }) as const,
      ),
    ]
  }),
]

/** The role bits a copied name still lacks, or `diverged` when the copy holds bits the original doesn't. */
export const missingGrants = (
  name: RegistryRepairName,
  copy: RegistryRepairName,
):
  | { readonly kind: 'grants'; readonly grants: readonly RoleGrant[] }
  | { readonly kind: 'diverged' } => {
  const accounts = accountsIn([...name.roles, ...copy.roles])
  const isDiverged = accounts.some(
    (account) =>
      (rolesOf(copy.roles, account) & ~rolesOf(name.roles, account)) !== 0n,
  )
  if (isDiverged) return { kind: 'diverged' }
  return {
    kind: 'grants',
    grants: accounts
      .map((account) => ({
        account,
        roleBitmap:
          rolesOf(name.roles, account) & ~rolesOf(copy.roles, account),
      }))
      .filter((grant) => grant.roleBitmap !== 0n),
  }
}
