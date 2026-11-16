import { TaggedError } from '@ens-apps/utils/neverthrow'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacGrantRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryUnregisterSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
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
  keccak256,
  stringToHex,
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
  /** Labels registered once but expired or unregistered now; a copy can't re-register them. */
  readonly expiredLabels: readonly string[]
}

/** Names a copy re-registers (owned, unexpired at `now`), and the labels it can't because they expired or were unregistered. */
export const splitRepairNames = (
  names: readonly RegistryRepairName[],
  now: bigint,
): Pick<RegistryRepairState, 'names' | 'expiredLabels'> => ({
  names: names.filter(
    (name) => !isAddressEqual(name.owner, zeroAddress) && name.expiry > now,
  ),
  expiredLabels: names
    .filter((name) => name.expiry !== 0n && name.expiry <= now)
    .map((name) => name.label),
})

export type RegistryRepairCall = {
  readonly to: Address
  readonly data: Hex
  readonly value: bigint
}

/** A registry nested under one of the copied names. */
export type RegistryChild = {
  readonly label: string
  readonly registry: Address
  /** It still names the copied registry and this label as its parent. */
  readonly isCanonical: boolean
  /** The account running the repair holds `ROLE_SET_PARENT` on it. */
  readonly canSetParent: boolean
}

/** The child registries under `names`, from each one's `getParent` (null when unreadable) and whether the account may re-parent it. */
export const toRegistryChildren = (params: {
  readonly registry: Address
  readonly names: readonly RegistryRepairName[]
  readonly parents: readonly (readonly [Address, string] | null)[]
  readonly canSetParent: readonly boolean[]
}): readonly RegistryChild[] =>
  params.names
    .filter((name) => !isAddressEqual(name.subregistry, zeroAddress))
    .map((name, i) => {
      const parent = params.parents[i]
      return {
        label: name.label,
        registry: name.subregistry,
        isCanonical:
          parent !== null &&
          parent !== undefined &&
          isAddressEqual(parent[0], params.registry) &&
          parent[1] === name.label,
        canSetParent: params.canSetParent[i] ?? false,
      }
    })

export type RegistryRepairPlan = {
  readonly replacement: Address
  /** Whatever the replacement still lacks: deploy, parent, names and their roles. */
  readonly copyCalls: readonly RegistryRepairCall[]
  /** Sent once the copy matches: switch the parent name, then re-parent the child registries the account can move. */
  readonly finalCalls: readonly RegistryRepairCall[]
  /** Child registries that keep the old registry as their parent. */
  readonly unmovedChildren: readonly RegistryChild[]
}

export class RegistryRepairPlanError extends TaggedError(
  'RegistryRepairPlanError',
)<{
  readonly reason:
    | 'no-root-roles'
    | 'name-without-owner'
    | 'duplicate-label'
    | 'replacement-diverged'
    | 'cannot-register'
    | 'cannot-set-parent'
    | 'cannot-grant'
  readonly label?: string
}> {}

/** The role resource a label gets on its first registration in a fresh registry. */
/** A label's id from its literal text; `labelhash` would read a `[<64 hex>]` label as already hashed. */
export const literalLabelId = (label: string): bigint =>
  BigInt(keccak256(stringToHex(label)))

const freshResourceOf = (label: string): bigint =>
  literalLabelId(label) & ~VERSION_BITS

const rolesOf = (grants: readonly RoleGrant[], account: Address): bigint =>
  grants
    .filter((grant) => isAddressEqual(grant.account, account))
    .reduce((bitmap, grant) => bitmap | grant.roleBitmap, 0n)

const call = (to: Address, data: Hex): RegistryRepairCall => ({
  to,
  data,
  value: 0n,
})

/** The roles a bitmap lets its holder grant: its admin roles and the regular roles they imply. */
const settableRoles = (bitmap: bigint): bigint => {
  const admin = bitmap >> 128n
  return (admin << 128n) | admin
}

/** The first grant `account` could not make on the replacement, which carries the same root roles. */
const findUngrantable = (
  state: RegistryRepairState,
  account: Address,
): RegistryRepairName | undefined => {
  const root = rolesOf(state.rootRoles, account)
  return state.names.find((name) => {
    // Right after `register`, the sender holds name roles only if it owns the name.
    const ownRoles = isAddressEqual(name.owner, account)
      ? rolesOf(name.roles, account)
      : 0n
    const settable = settableRoles(root | ownRoles)
    return name.roles.some(
      (grant) =>
        !isAddressEqual(grant.account, name.owner) &&
        (grant.roleBitmap & ~settable) !== 0n,
    )
  })
}

const findPlanProblem = (
  state: RegistryRepairState,
  account: Address,
): RegistryRepairPlanError | null => {
  if (!state.rootRoles.some((grant) => grant.roleBitmap !== 0n))
    return new RegistryRepairPlanError({ reason: 'no-root-roles' })
  if ((rolesOf(state.rootRoles, account) & registryRoles.ROLE_REGISTRAR) === 0n)
    return new RegistryRepairPlanError({ reason: 'cannot-register' })
  if (
    (rolesOf(state.rootRoles, account) & registryRoles.ROLE_SET_PARENT) ===
    0n
  )
    return new RegistryRepairPlanError({ reason: 'cannot-set-parent' })
  const ungrantable = findUngrantable(state, account)
  if (ungrantable)
    return new RegistryRepairPlanError({
      reason: 'cannot-grant',
      label: ungrantable.label,
    })
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

const grantCall = (
  replacement: Address,
  label: string,
  grant: RoleGrant,
): RegistryRepairCall =>
  call(
    replacement,
    encodeFunctionData({
      abi: eacGrantRolesSnippet,
      functionName: 'grantRoles',
      args: [freshResourceOf(label), grant.roleBitmap, grant.account],
    }),
  )

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
    .map((grant) => grantCall(replacement, name.label, grant)),
]

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

/** The role bits a copied name still lacks, or null when the copy holds bits the original doesn't. */
const missingGrants = (
  name: RegistryRepairName,
  copy: RegistryRepairName,
): readonly RoleGrant[] | null => {
  const accounts = accountsIn([...name.roles, ...copy.roles])
  if (
    accounts.some(
      (account) =>
        (rolesOf(copy.roles, account) & ~rolesOf(name.roles, account)) !== 0n,
    )
  )
    return null
  return accounts
    .map((account) => ({
      account,
      roleBitmap: rolesOf(name.roles, account) & ~rolesOf(copy.roles, account),
    }))
    .filter((grant) => grant.roleBitmap !== 0n)
}

const isDivergence = (difference: RegistryRepairDifference): boolean =>
  difference.kind === 'root-roles' || difference.kind === 'name-field'

/** The copy calls still needed when `existing` (the replacement's current state) holds part of the copy. */
/** Unregisters names the replacement holds but the original no longer does, so a resume never brings back a deleted subname. */
const extraNameCalls = (
  state: RegistryRepairState,
  existing: RegistryRepairState,
  replacement: Address,
  account: Address,
): Result<readonly RegistryRepairCall[], RegistryRepairPlanError> => {
  const extras = existing.names.filter(
    (copy) => !state.names.some((name) => name.label === copy.label),
  )
  const [first] = extras
  if (
    first &&
    (rolesOf(state.rootRoles, account) & registryRoles.ROLE_UNREGISTER) === 0n
  )
    return err(
      new RegistryRepairPlanError({
        reason: 'replacement-diverged',
        label: first.label,
      }),
    )
  return ok(
    extras.map((copy) =>
      call(
        replacement,
        encodeFunctionData({
          abi: permissionedRegistryUnregisterSnippet,
          functionName: 'unregister',
          args: [literalLabelId(copy.label)],
        }),
      ),
    ),
  )
}

const resumeCopyCalls = (params: {
  readonly state: RegistryRepairState
  readonly existing: RegistryRepairState
  readonly replacement: Address
  readonly account: Address
  readonly setParent: RegistryRepairCall
}): Result<readonly RegistryRepairCall[], RegistryRepairPlanError> => {
  const { state, existing, replacement, setParent } = params
  const divergence = compareRegistryRepair(state, existing).find(isDivergence)
  if (divergence)
    return err(
      new RegistryRepairPlanError({
        reason: 'replacement-diverged',
        ...('label' in divergence && { label: divergence.label }),
      }),
    )
  const isParentSet =
    isAddressEqual(existing.parentRegistry, state.parentRegistry) &&
    existing.parentLabel === state.parentLabel
  const nameCallsOrNull = state.names.map((name) => {
    const copy = existing.names.find((other) => other.label === name.label)
    if (!copy) return nameCalls(replacement, name)
    const grants = missingGrants(name, copy)
    return grants?.map((grant) => grantCall(replacement, name.label, grant))
  })
  const divergedAt = nameCallsOrNull.indexOf(undefined)
  if (divergedAt !== -1)
    return err(
      new RegistryRepairPlanError({
        reason: 'replacement-diverged',
        label: state.names[divergedAt]?.label,
      }),
    )
  return extraNameCalls(state, existing, replacement, params.account).map(
    (unregisters) => [
      ...(isParentSet ? [] : [setParent]),
      ...unregisters,
      ...nameCallsOrNull.flatMap((calls) => calls ?? []),
    ],
  )
}

/** Calls that copy a registry into `replacement` and switch its parent name to it; `existing` (the replacement's state, or null) resumes a stopped copy. */
export const planRegistryRepair = (params: {
  readonly state: RegistryRepairState
  readonly existing: RegistryRepairState | null
  readonly children: readonly RegistryChild[]
  /** The account that sends the calls; it must be able to register and grant on the replacement. */
  readonly account: Address
  readonly factory: Address
  readonly implementation: Address
  readonly salt: bigint
  readonly replacement: Address
}): Result<RegistryRepairPlan, RegistryRepairPlanError> => {
  const { state, existing, children, factory, implementation, salt } = params
  const { replacement } = params
  const problem = findPlanProblem(state, params.account)
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
  const movable = children.filter((child) => child.isCanonical)

  const copyCalls = existing
    ? resumeCopyCalls({
        state,
        existing,
        replacement,
        account: params.account,
        setParent,
      })
    : ok([
        deploy,
        setParent,
        ...state.names.flatMap((name) => nameCalls(replacement, name)),
      ])

  return copyCalls.map((calls) => ({
    replacement,
    copyCalls: calls,
    // The switch goes last: until it lands the notice stays up, so stopped child moves can resume.
    finalCalls: [
      ...movable
        .filter((child) => child.canSetParent)
        .map((child) =>
          call(
            child.registry,
            encodeFunctionData({
              abi: userRegistrySetParentSnippet,
              functionName: 'setParent',
              args: [replacement, child.label],
            }),
          ),
        ),
      switchParent,
    ],
    unmovedChildren: movable.filter((child) => !child.canSetParent),
  }))
}
