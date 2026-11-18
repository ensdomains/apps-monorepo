import { TaggedError } from '@ens-apps/utils/neverthrow'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import {
  eacGrantRolesSnippet,
  eacRevokeRootRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryUnregisterSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  userRegistryInitializeSnippet,
  userRegistryRegisterSnippet,
  userRegistrySetParentSnippet,
  userRegistrySetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/userRegistry'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { err, ok, Result } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
} from 'viem'
import type { RegistryChild } from './registryRepairChildren'
import { compareRegistryRepair, missingGrants } from './registryRepairCompare'
import {
  literalLabelId,
  type RegistryRepairCall,
  type RegistryRepairName,
  type RegistryRepairState,
  type RoleGrant,
  rolesOf,
} from './registryRepairState'

/** The low 32 bits of a token id or resource carry its version; a fresh registry starts every name at version 0. */
const VERSION_BITS = 0xffff_ffffn

/** Root roles the account needs on the registry being upgraded: registering the names and setting the replacement's parent. */
const REGISTRY_REPAIR_ROOT_ROLES =
  registryRoles.ROLE_REGISTRAR | registryRoles.ROLE_SET_PARENT

export type RegistryRepairPlan = {
  readonly replacement: Address
  /** Whatever the replacement still lacks: deploy, parent, names and their roles. */
  readonly copyCalls: readonly RegistryRepairCall[]
  /** Sent once the copy matches: re-parent the child registries the account can move, then switch the parent name. */
  readonly finalCalls: readonly RegistryRepairCall[]
  /** Child registries that stay on the old parent. */
  readonly unmovedChildren: readonly RegistryChild[]
}

export class RegistryRepairPlanError extends TaggedError(
  'RegistryRepairPlanError',
)<{
  readonly reason:
    | 'no-root-roles'
    | 'missing-root-roles'
    | 'cannot-grant'
    | 'replacement-diverged'
  readonly label?: string
}> {}

const freshResourceOf = (label: string): bigint =>
  literalLabelId(label) & ~VERSION_BITS

const call = (to: Address, data: Hex): RegistryRepairCall => ({
  to,
  data,
  value: 0n,
})

// On a name, only the regular roles behind held admin roles can be granted; admin roles come only with `register`.
const nameSettableRoles = (bitmap: bigint): bigint => bitmap >> 128n

/** The first name with a grant `account` couldn't make on the replacement, which carries the same root roles. */
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
    const settable = nameSettableRoles(root | ownRoles)
    return name.roles.some(
      (grant) =>
        !isAddressEqual(grant.account, name.owner) &&
        (grant.roleBitmap & ~settable) !== 0n,
    )
  })
}

/** The replacement's root roles: the original's, and an account without the roles to copy gets every role the original's admins hold. */
const withRunnerRootRoles = (
  state: RegistryRepairState,
  account: Address,
): RegistryRepairState => {
  const accountRoot = rolesOf(state.rootRoles, account)
  if ((accountRoot & REGISTRY_REPAIR_ROOT_ROLES) === REGISTRY_REPAIR_ROOT_ROLES)
    return state
  const adminRoles = state.rootRoles.reduce(
    (all, grant) => all | grant.roleBitmap,
    0n,
  )
  return {
    ...state,
    rootRoles: [
      ...state.rootRoles.filter(
        (grant) => !isAddressEqual(grant.account, account),
      ),
      { account, roleBitmap: accountRoot | adminRoles },
    ],
  }
}

const findPlanProblem = (
  state: RegistryRepairState,
  account: Address,
): RegistryRepairPlanError | null => {
  if (!state.rootRoles.some((grant) => grant.roleBitmap !== 0n))
    return new RegistryRepairPlanError({ reason: 'no-root-roles' })
  const accountRoot = rolesOf(state.rootRoles, account)
  if ((accountRoot & REGISTRY_REPAIR_ROOT_ROLES) !== REGISTRY_REPAIR_ROOT_ROLES)
    return new RegistryRepairPlanError({ reason: 'missing-root-roles' })
  const ungrantable = findUngrantable(state, account)
  if (ungrantable)
    return new RegistryRepairPlanError({
      reason: 'cannot-grant',
      label: ungrantable.label,
    })
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

const diverged = (label?: string) =>
  new RegistryRepairPlanError({
    reason: 'replacement-diverged',
    ...(label !== undefined && { label }),
  })

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
    return err(diverged(first.label))
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

/** The calls one name still needs on the replacement, or `replacement-diverged` when its copy holds roles the original doesn't. */
const resumeNameCalls = (
  name: RegistryRepairName,
  existing: RegistryRepairState,
  replacement: Address,
): Result<readonly RegistryRepairCall[], RegistryRepairPlanError> => {
  const copy = existing.names.find((other) => other.label === name.label)
  if (!copy) return ok(nameCalls(replacement, name))
  const missing = missingGrants(name, copy)
  return missing.kind === 'diverged'
    ? err(diverged(name.label))
    : ok(
        missing.grants.map((grant) =>
          grantCall(replacement, name.label, grant),
        ),
      )
}

/** The copy calls still needed when `existing` (the replacement's current state) holds part of the copy. */
const resumeCopyCalls = ({
  state,
  existing,
  replacement,
  account,
  setParent,
}: {
  readonly state: RegistryRepairState
  readonly existing: RegistryRepairState
  readonly replacement: Address
  readonly account: Address
  readonly setParent: RegistryRepairCall
}): Result<readonly RegistryRepairCall[], RegistryRepairPlanError> => {
  const divergence = compareRegistryRepair(state, existing).find(
    (difference) =>
      difference.kind === 'root-roles' || difference.kind === 'name-field',
  )
  if (divergence)
    return err(diverged('label' in divergence ? divergence.label : undefined))
  const isParentSet =
    isAddressEqual(existing.parentRegistry, state.parentRegistry) &&
    existing.parentLabel === state.parentLabel
  return Result.combine([
    extraNameCalls(state, existing, replacement, account),
    ...state.names.map((name) => resumeNameCalls(name, existing, replacement)),
  ]).map((groups) => [...(isParentSet ? [] : [setParent]), ...groups.flat()])
}

/** Root roles the runner holds on the replacement only, and gives back in Case B once the copy is done. */
const temporaryRootRoles = (
  original: RegistryRepairState,
  state: RegistryRepairState,
  account: Address,
): bigint => {
  const isShared = original.names.some(
    (name) => !isAddressEqual(name.owner, account),
  )
  if (!isShared) return 0n
  return (
    rolesOf(state.rootRoles, account) & ~rolesOf(original.rootRoles, account)
  )
}

/** A stopped Case B run may have given its temporary roles back already; the copy is then what the original was. */
const isRelinquished = (
  original: RegistryRepairState,
  existing: RegistryRepairState | null,
  account: Address,
  temporary: bigint,
): existing is RegistryRepairState =>
  temporary !== 0n &&
  existing !== null &&
  rolesOf(existing.rootRoles, account) === rolesOf(original.rootRoles, account)

/** Calls that copy a registry into `replacement` and switch its parent name to it; `existing` (the replacement's state, or null) resumes a stopped copy. */
export const planRegistryRepair = ({
  state: original,
  existing,
  children,
  account,
  factory,
  implementation,
  salt,
  replacement,
}: {
  readonly state: RegistryRepairState
  readonly existing: RegistryRepairState | null
  readonly children: readonly RegistryChild[]
  /** The account that sends the calls; it must be able to switch the parent name, which the caller checks. */
  readonly account: Address
  readonly factory: Address
  readonly implementation: Address
  readonly salt: bigint
  readonly replacement: Address
}): Result<RegistryRepairPlan, RegistryRepairPlanError> => {
  // The parent's owner may run the upgrade without the original's root roles; it becomes an admin of the replacement too.
  const state = withRunnerRootRoles(original, account)
  const problem = findPlanProblem(state, account)
  if (problem) return err(problem)
  const temporary = temporaryRootRoles(original, state, account)
  const hasRelinquished = isRelinquished(original, existing, account, temporary)

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

  const copyCalls = existing
    ? resumeCopyCalls({
        state: hasRelinquished
          ? { ...state, rootRoles: original.rootRoles }
          : state,
        existing,
        replacement,
        account,
        setParent,
      }).andThen((calls) =>
        // Without its temporary roles the runner can't finish a copy; a fresh attempt can.
        hasRelinquished && calls.length > 0 ? err(diverged()) : ok(calls),
      )
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
      ...children
        .filter((child) => child.action === 'move')
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
      ...(temporary !== 0n && !hasRelinquished
        ? [
            call(
              replacement,
              encodeFunctionData({
                abi: eacRevokeRootRolesSnippet,
                functionName: 'revokeRootRoles',
                args: [temporary, account],
              }),
            ),
          ]
        : []),
      switchParent,
    ],
    unmovedChildren: children.filter((child) => child.action === 'leave'),
  }))
}
