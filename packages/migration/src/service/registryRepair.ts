import { TaggedError } from '@ens-apps/utils/neverthrow'
import { eacGrantRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  userRegistryInitializeSnippet,
  userRegistryRegisterSnippet,
  userRegistrySetParentSnippet,
  userRegistrySetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/userRegistry'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { err, ok, type Result } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  labelhash,
  zeroAddress,
} from 'viem'

/** The low 32 bits of a token id or resource carry its version; a fresh registry starts every name at version 0. */
const VERSION_BITS = 0xffff_ffffn

export type RoleGrant = {
  readonly account: Address
  readonly roleBitmap: bigint
}

/** One live name in a registry, with every account holding roles on it (its owner included). */
export type RegistryRepairName = {
  readonly label: string
  readonly owner: Address
  readonly subregistry: Address
  readonly resolver: Address
  readonly expiry: bigint
  readonly roles: readonly RoleGrant[]
}

/** What a registry holds that a copy has to reproduce. */
export type RegistryRepairState = {
  readonly parentRegistry: Address
  readonly parentLabel: string
  /** The parent name's token id in `parentRegistry`, for its `setSubregistry`. */
  readonly parentTokenId: bigint
  readonly rootRoles: readonly RoleGrant[]
  readonly names: readonly RegistryRepairName[]
}

export type RegistryRepairCall = {
  readonly to: Address
  readonly data: Hex
  readonly value: bigint
}

export type RegistryRepairPlan = {
  readonly replacement: Address
  readonly calls: readonly RegistryRepairCall[]
}

export class RegistryRepairPlanError extends TaggedError(
  'RegistryRepairPlanError',
)<{
  readonly reason: 'no-root-roles' | 'name-without-owner' | 'duplicate-label'
  readonly label?: string
}> {}

/** The role resource a label gets on its first registration in a fresh registry. */
const freshResourceOf = (label: string): bigint =>
  BigInt(labelhash(label)) & ~VERSION_BITS

const rolesOf = (grants: readonly RoleGrant[], account: Address): bigint =>
  grants
    .filter((grant) => isAddressEqual(grant.account, account))
    .reduce((bitmap, grant) => bitmap | grant.roleBitmap, 0n)

const call = (to: Address, data: Hex): RegistryRepairCall => ({
  to,
  data,
  value: 0n,
})

const findPlanProblem = (
  state: RegistryRepairState,
): RegistryRepairPlanError | null => {
  if (!state.rootRoles.some((grant) => grant.roleBitmap !== 0n))
    return new RegistryRepairPlanError({ reason: 'no-root-roles' })
  const seen = new Set<string>()
  for (const name of state.names) {
    if (isAddressEqual(name.owner, zeroAddress))
      return new RegistryRepairPlanError({
        reason: 'name-without-owner',
        label: name.label,
      })
    if (seen.has(name.label))
      return new RegistryRepairPlanError({
        reason: 'duplicate-label',
        label: name.label,
      })
    seen.add(name.label)
  }
  return null
}

const nameCalls = (
  replacement: Address,
  name: RegistryRepairName,
): readonly RegistryRepairCall[] => [
  call(
    replacement,
    encodeFunctionData({
      abi: userRegistryRegisterSnippet,
      functionName: 'register',
      args: [
        name.label,
        name.owner,
        name.subregistry,
        name.resolver,
        rolesOf(name.roles, name.owner),
        name.expiry,
      ],
    }),
  ),
  ...name.roles
    .filter(
      (grant) =>
        grant.roleBitmap !== 0n && !isAddressEqual(grant.account, name.owner),
    )
    .map((grant) =>
      call(
        replacement,
        encodeFunctionData({
          abi: eacGrantRolesSnippet,
          functionName: 'grantRoles',
          args: [freshResourceOf(name.label), grant.roleBitmap, grant.account],
        }),
      ),
    ),
]

/** Calls that copy a registry into `replacement` (the address `factory` deploys for this salt and sender) and switch its parent name to it. */
export const planRegistryRepair = (params: {
  readonly state: RegistryRepairState
  readonly factory: Address
  readonly implementation: Address
  readonly salt: bigint
  readonly replacement: Address
}): Result<RegistryRepairPlan, RegistryRepairPlanError> => {
  const { state, factory, implementation, salt, replacement } = params
  const problem = findPlanProblem(state)
  if (problem) return err(problem)

  const deploy = call(
    factory,
    encodeFunctionData({
      abi: verifiableFactoryDeployProxySnippet,
      functionName: 'deployProxy',
      args: [
        implementation,
        salt,
        encodeFunctionData({
          abi: userRegistryInitializeSnippet,
          functionName: 'initialize',
          args: [state.rootRoles.filter((grant) => grant.roleBitmap !== 0n)],
        }),
      ],
    }),
  )
  const setParent = call(
    replacement,
    encodeFunctionData({
      abi: userRegistrySetParentSnippet,
      functionName: 'setParent',
      args: [state.parentRegistry, state.parentLabel],
    }),
  )
  const switchParent = call(
    state.parentRegistry,
    encodeFunctionData({
      abi: userRegistrySetSubregistrySnippet,
      functionName: 'setSubregistry',
      args: [state.parentTokenId, replacement],
    }),
  )

  return ok({
    replacement,
    calls: [
      deploy,
      setParent,
      ...state.names.flatMap((name) => nameCalls(replacement, name)),
      switchParent,
    ],
  })
}

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

const accountsIn = (grants: readonly RoleGrant[]): readonly Address[] => [
  ...new Map(
    grants.map((grant) => [grant.account.toLowerCase(), grant.account]),
  ).values(),
]

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
