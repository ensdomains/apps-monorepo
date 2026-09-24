import { requireChainId } from '@ens-apps/config'
import {
  buildHcaOwnerExecutionCall,
  computeResolverAddress,
} from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Address,
  type Hex,
  isAddressEqual,
  namehash,
  type PublicClient,
} from 'viem'
import { envConfig } from '@/config'

import { V2_CONTRACTS } from '../contracts/addresses'
import {
  GAS_HEURISTIC,
  GRANT_ROLES_GAS,
  MULTICALL_OVERHEAD,
  PER_BATCH_OVERHEAD,
  SETABI_GAS,
  SETADDR_GAS,
  SETCONTENTHASH_GAS,
  SETTEXT_GAS,
  TARGET_GAS,
} from './batchMigrate.constants'
import {
  type AtomicMigrationBatch,
  type AtomicMigrationInnerExecution,
  buildAtomicMigrationBatches,
  buildAtomicMigrationInnerExecutions,
} from './buildAtomicMigrationBatches'
import {
  buildStepDescriptors,
  type MigrationStepDescriptor,
} from './buildStepDescriptors'
import {
  type ClassifiedName,
  classifyNames,
  type DirectClassifiedName,
  FUSES,
  type GroupedNames,
  groupClassifiedNames,
  hasFuse,
  type IneligibleName,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { assertCopyMigrationReadiness } from './copyMigrationReadiness'
import {
  type DirectMigrationRoute,
  resolveDirectMigrationRoutes,
} from './directMigrationRoutes'
import { resolverFor } from './encodeMigration'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import { migrationApprovalForId } from './migrationApprovals'
import {
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  type MigrationBatchJournalScope,
  type MigrationJournalOperation,
  type MigrationRecoverySnapshot,
} from './migrationBatchJournal'
import {
  assertLockedPublicResolverSetMembership,
  assertRequiredMigrationContractCode,
  checkDeterministicMigrationResolverReadiness,
  checkMigrationHcaReadiness,
  getRequiredMigrationContracts,
} from './migrationInvariants'
import {
  getV1ProfileKeys,
  type V1Domain,
  type V1ProfileKeys,
} from './v1SubgraphClient'

export type MigrationPlan = {
  readonly hcaAddress: Address
  readonly hcaDeploymentRequired: boolean
  readonly migrationOwner: Address
  readonly classified: readonly ClassifiedName[]
  /** Immutable selected tree used to keep deterministic registry routes on retry. */
  readonly registryContext: readonly ClassifiedName[]
  readonly ineligible: readonly IneligibleName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly ownedPermRes: Address | null
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly directRoutes: ReadonlyMap<string, DirectMigrationRoute>
  readonly atomicBatches: readonly AtomicMigrationBatch[]
  readonly stepDescriptors: readonly MigrationStepDescriptor[]
  /** Completed operations recovered from a durable cross-reload attempt. */
  readonly priorCompletedOperations?: readonly MigrationJournalOperation[]
  /** Reconcile durable intents/receipts and live V2 state before submitting. */
  readonly requiresReconciliation?: boolean
}

const fetchProfilesForNames = async (params: {
  namesToOwnedPermRes: readonly ClassifiedName[]
  preflight: MigrationPreflight
  publicClient: PublicClient
  signal?: AbortSignal
}): Promise<Map<Hex, Profile>> => {
  const { namesToOwnedPermRes, preflight, publicClient, signal } = params
  signal?.throwIfAborted()
  if (namesToOwnedPermRes.length === 0 || preflight.skipFetchProfilesPhase) {
    return new Map()
  }
  return fetchV1Profiles({
    names: namesToOwnedPermRes
      .filter((n) => n.v1ResolverAddress)
      .map((n) => ({
        nodeHex: namehash(n.domain.name) as Hex,
        v1ResolverAddress: n.v1ResolverAddress as Address,
      })),
    publicClient,
    profileKeys: preflight.profileKeys,
    signal,
  })
}

const STATIC_INNER_EXECUTION_GAS = {
  'resolver-deployment': 240_000n,
  'wallet-co-admin-grant': 70_000n,
  'user-registry-deployment': 300_000n,
  'user-registry-wallet-grant': 80_000n,
  'user-registry-parent': 70_000n,
  'copy-register': 0n,
  'manager-role-grant': GRANT_ROLES_GAS,
  migrate: 0n,
} as const satisfies Partial<
  Record<AtomicMigrationInnerExecution['phase'], bigint>
>

const profileReplayGas = (params: {
  readonly execution: AtomicMigrationInnerExecution
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
}): bigint => {
  const classified = params.classifiedByName.get(params.execution.name)
  if (!classified) return 0n
  const profile = params.profiles.get(
    profileMapKey(namehash(classified.domain.name)),
  )
  if (!profile) return 0n

  return (
    MULTICALL_OVERHEAD +
    BigInt(profile.texts.length) * SETTEXT_GAS +
    BigInt(profile.addresses.length) * SETADDR_GAS +
    (profile.contentHash ? SETCONTENTHASH_GAS : 0n) +
    BigInt(profile.abis.length) * SETABI_GAS
  )
}

const innerExecutionGas = (params: {
  readonly execution: AtomicMigrationInnerExecution
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
}): bigint => {
  if (params.execution.phase === 'profile-replay') {
    return profileReplayGas(params)
  }
  return STATIC_INNER_EXECUTION_GAS[params.execution.phase]
}

const previewAtomicBatchGas = (params: {
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly names: readonly string[]
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
}): bigint => {
  const nameGas = params.names.reduce((gas, name) => {
    const classified = params.classifiedByName.get(name)
    if (!classified) return gas
    return (
      gas +
      (classified.action === 'migrate'
        ? GAS_HEURISTIC[classified.tokenType]
        : 200_000n)
    )
  }, 0n)
  const executionGas = params.innerExecutions.reduce(
    (gas, execution) =>
      gas +
      innerExecutionGas({
        execution,
        classifiedByName: params.classifiedByName,
        profiles: params.profiles,
      }),
    0n,
  )

  return PER_BATCH_OVERHEAD + nameGas + executionGas
}

class LockedResolverRecordSafetyError extends TaggedError(
  'LockedResolverRecordSafetyError',
)<{
  readonly ensName: string
  readonly v1Resolver: Address
  readonly replacementResolver: Address
  readonly reason:
    | 'inventory-unavailable'
    | 'inventory-missing'
    | 'records-not-replayable'
  readonly textRecordCount?: number
  readonly addressRecordCount?: number
  readonly contentHashRecordCount?: number
  readonly abiRecordCount?: number
  readonly cause?: unknown
}> {}

export class MigrationRecoveryPlanError extends TaggedError(
  'MigrationRecoveryPlanError',
)<{
  readonly message: string
  readonly reason:
    | 'classification-changed'
    | 'operation-mismatch'
    | 'resolver-mismatch'
    | 'profile-mismatch'
}> {}

type LockedResolverReplacement = {
  readonly name: ClassifiedName
  readonly v1Resolver: Address
  readonly replacementResolver: Address
}

const lockedResolverReplacementsWithoutAtomicReplay = (
  classified: readonly ClassifiedName[],
): readonly LockedResolverReplacement[] =>
  classified.flatMap((name) => {
    const isLockedCannotSetResolver =
      (name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child') &&
      hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER)
    if (
      !isLockedCannotSetResolver ||
      !name.v1ResolverAddress ||
      name.resolverStrategy === 'to-owned-permres'
    ) {
      return []
    }

    const replacementResolver = resolverFor(
      name,
      V2_CONTRACTS.DefaultResolver,
      null,
    )
    if (
      replacementResolver.toLowerCase() === name.v1ResolverAddress.toLowerCase()
    ) {
      return []
    }

    return [
      {
        name,
        v1Resolver: name.v1ResolverAddress as Address,
        replacementResolver,
      },
    ]
  })

const assertLockedResolverInventoryComplete = (
  candidates: readonly LockedResolverReplacement[],
  profileKeys: readonly V1ProfileKeys[],
): void => {
  const inventoryIds = new Set(profileKeys.map((keys) => keys.id.toLowerCase()))
  for (const candidate of candidates) {
    if (inventoryIds.has(candidate.name.domain.id.toLowerCase())) continue
    throw new LockedResolverRecordSafetyError({
      message: `The record inventory for "${candidate.name.domain.name}" is incomplete; migration is blocked to prevent record loss`,
      ensName: candidate.name.domain.name,
      v1Resolver: candidate.v1Resolver,
      replacementResolver: candidate.replacementResolver,
      reason: 'inventory-missing',
    })
  }
}

const fetchLockedResolverProfiles = async (params: {
  readonly candidates: readonly LockedResolverReplacement[]
  readonly profileKeys: readonly V1ProfileKeys[]
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
}): Promise<ReadonlyMap<Hex, Profile>> => {
  try {
    return await fetchV1Profiles({
      names: params.candidates.map(({ name, v1Resolver }) => ({
        nodeHex: namehash(name.domain.name) as Hex,
        v1ResolverAddress: v1Resolver,
      })),
      publicClient: params.publicClient,
      profileKeys: params.profileKeys,
      signal: params.signal,
    })
  } catch (cause) {
    const first = params.candidates[0]
    if (!first) return new Map()
    throw new LockedResolverRecordSafetyError({
      message: `Unable to verify records for "${first.name.domain.name}"; migration is blocked to prevent record loss`,
      ensName: first.name.domain.name,
      v1Resolver: first.v1Resolver,
      replacementResolver: first.replacementResolver,
      reason: 'inventory-unavailable',
      cause,
    })
  }
}

const assertLockedResolverProfilesEmpty = (
  candidates: readonly LockedResolverReplacement[],
  profiles: ReadonlyMap<Hex, Profile>,
): void => {
  for (const candidate of candidates) {
    const profile = profiles.get(
      profileMapKey(namehash(candidate.name.domain.name)),
    )
    if (!profile) {
      throw new LockedResolverRecordSafetyError({
        message: `The record inventory for "${candidate.name.domain.name}" is incomplete; migration is blocked to prevent record loss`,
        ensName: candidate.name.domain.name,
        v1Resolver: candidate.v1Resolver,
        replacementResolver: candidate.replacementResolver,
        reason: 'inventory-missing',
      })
    }
    if (
      profile.texts.length === 0 &&
      profile.addresses.length === 0 &&
      profile.contentHash === null &&
      profile.abis.length === 0
    ) {
      continue
    }
    throw new LockedResolverRecordSafetyError({
      message: `"${candidate.name.domain.name}" has records that cannot be replayed atomically during its locked resolver replacement`,
      ensName: candidate.name.domain.name,
      v1Resolver: candidate.v1Resolver,
      replacementResolver: candidate.replacementResolver,
      reason: 'records-not-replayable',
      textRecordCount: profile.texts.length,
      addressRecordCount: profile.addresses.length,
      contentHashRecordCount: profile.contentHash ? 1 : 0,
      abiRecordCount: profile.abis.length,
    })
  }
}

/**
 * The locked receiver can rotate an allowlisted public resolver even though
 * CANNOT_SET_RESOLVER is burned, but the current atomic plan cannot replay
 * records into the shared PublicResolverV2. Permit that rotation only after
 * proving the supported record inventory is empty on-chain.
 */
export const assertLockedResolverReplacementRecordSafety = async (
  classified: readonly ClassifiedName[],
  publicClient: PublicClient,
  signal?: AbortSignal,
): Promise<void> => {
  signal?.throwIfAborted()
  const candidates = lockedResolverReplacementsWithoutAtomicReplay(classified)
  if (candidates.length === 0) return

  const result = await getV1ProfileKeys(
    candidates.map(({ name }) => name.domain.id),
    { signal },
  )
  signal?.throwIfAborted()
  if (result.isErr()) {
    const first = candidates[0]
    if (!first) return
    throw new LockedResolverRecordSafetyError({
      message: `Unable to verify records for "${first.name.domain.name}"; migration is blocked to prevent record loss`,
      ensName: first.name.domain.name,
      v1Resolver: first.v1Resolver,
      replacementResolver: first.replacementResolver,
      reason: 'inventory-unavailable',
      cause: result.error,
    })
  }

  assertLockedResolverInventoryComplete(candidates, result.value)
  const profiles = await fetchLockedResolverProfiles({
    candidates,
    profileKeys: result.value,
    publicClient,
    signal,
  })
  signal?.throwIfAborted()
  assertLockedResolverProfilesEmpty(candidates, profiles)
}

export const buildMigrationPlan = async (params: {
  domains: readonly V1Domain[]
  hcaAddress: Address
  migrationOwner: Address
  publicClient: PublicClient
  preflight: MigrationPreflight
  signal?: AbortSignal
}): Promise<MigrationPlan> => {
  const {
    domains,
    hcaAddress,
    migrationOwner,
    publicClient,
    preflight,
    signal,
  } = params
  signal?.throwIfAborted()

  const classifiedNamesResult = classifyNames(
    [...domains],
    migrationOwner,
    envConfig.chain.id,
  )
  const classified = classifiedNamesResult.classified
  const directNames = classified.filter(
    (name): name is DirectClassifiedName => name.action === 'migrate',
  )
  await assertLockedResolverReplacementRecordSafety(
    classified,
    publicClient,
    signal,
  )
  signal?.throwIfAborted()
  const directRoutes =
    preflight.directMigrationRoutes ??
    (await resolveDirectMigrationRoutes({
      publicClient,
      classified: directNames,
    }))
  signal?.throwIfAborted()
  await assertCopyMigrationReadiness({
    publicClient,
    hca: hcaAddress,
    wallet: migrationOwner,
    remaining: classified,
    registryContext: classified,
  })
  signal?.throwIfAborted()
  const { ineligible } = classifiedNamesResult
  const groups = groupClassifiedNames([...classified])
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )

  let ownedPermRes: Address | null = null
  if (namesToOwnedPermRes.length > 0) {
    ownedPermRes =
      preflight.hcaResolverAddress ??
      computeResolverAddress({
        chainId: requireChainId(publicClient, 'migration'),
        hca: hcaAddress,
      })
  }

  const profiles = await fetchProfilesForNames({
    namesToOwnedPermRes,
    preflight,
    publicClient,
    signal,
  })
  signal?.throwIfAborted()

  const classifiedByName = new Map(
    classified.map((name) => [name.domain.name, name] as const),
  )
  const resolverDeployed = preflight.hcaResolverReadiness?.status === 'verified'
  const walletCoAdminGranted =
    preflight.hcaResolverReadiness?.status === 'verified' &&
    preflight.hcaResolverReadiness.walletHasWildcardRoles
  const atomicPlan = await buildAtomicMigrationBatches({
    chainId: requireChainId(publicClient, 'migration'),
    hca: hcaAddress,
    wallet: migrationOwner,
    classified,
    registryContext: classified,
    directRoutes,
    profiles,
    defaultResolver: V2_CONTRACTS.DefaultResolver,
    resolverDeployed,
    walletCoAdminGranted,
    maxOuterGas: TARGET_GAS,
    estimateOuterGas: ({ names, innerExecutions }) =>
      previewAtomicBatchGas({
        classifiedByName,
        profiles,
        names,
        innerExecutions,
      }),
  })
  signal?.throwIfAborted()

  const approvals = preflight.migrationApprovals ?? []
  const hcaDeploymentRequired =
    preflight.hcaReadiness?.status === 'deployment-required'
  const registrationApprovalTargets = groups.unwrapped.map(({ domain }) => ({
    name: domain.name,
    tokenId: BigInt(domain.labelhash),
  }))
  const stepDescriptors = buildStepDescriptors({
    hcaDeploymentRequired,
    approvals,
    atomicBatches: atomicPlan.batches,
    registrationApprovalTargets,
  })

  return {
    hcaAddress,
    hcaDeploymentRequired,
    migrationOwner,
    classified,
    registryContext: classified,
    ineligible,
    groups,
    preflight,
    ownedPermRes,
    profiles,
    directRoutes,
    atomicBatches: atomicPlan.batches,
    stepDescriptors,
  }
}

const assertRecoveryOperationsMatch = (params: {
  readonly classified: readonly ClassifiedName[]
  readonly snapshot: MigrationRecoverySnapshot
}): void => {
  const current = params.classified.map(({ domain, action }) => ({
    name: domain.name,
    action,
  }))
  if (
    current.length !== params.snapshot.registryOperations.length ||
    current.some(({ name, action }, index) => {
      const expected = params.snapshot.registryOperations[index]
      return expected?.name !== name || expected.action !== action
    })
  ) {
    throw new MigrationRecoveryPlanError({
      message:
        'The durable migration tree no longer classifies to the recorded migrate/copy operations.',
      reason: 'operation-mismatch',
    })
  }
}

const assertRecoveryProfilesComplete = (params: {
  readonly classified: readonly ClassifiedName[]
  readonly profiles: ReadonlyMap<Hex, Profile>
}): void => {
  const expectedNodes = new Set(
    params.classified
      .filter((name) => name.resolverStrategy === 'to-owned-permres')
      .map((name) => profileMapKey(namehash(name.domain.name))),
  )
  const actualNodes = new Set(
    [...params.profiles.keys()].map((node) => profileMapKey(node)),
  )
  if (
    expectedNodes.size !== actualNodes.size ||
    [...expectedNodes].some((node) => !actualNodes.has(node))
  ) {
    throw new MigrationRecoveryPlanError({
      message:
        'The durable migration record snapshot is incomplete or contains unexpected names.',
      reason: 'profile-mismatch',
    })
  }
}

export const classifyMigrationRecoverySnapshot = (params: {
  readonly snapshot: MigrationRecoverySnapshot
  readonly migrationOwner: Address
}): {
  readonly registryContext: readonly ClassifiedName[]
  readonly classified: readonly ClassifiedName[]
} => {
  const result = classifyNames(
    [...params.snapshot.registryDomains],
    params.migrationOwner,
    envConfig.chain.id,
  )
  if (
    result.ineligible.length > 0 ||
    result.classified.length !== params.snapshot.registryDomains.length
  ) {
    throw new MigrationRecoveryPlanError({
      message:
        'The durable migration source data no longer produces the complete selected tree.',
      reason: 'classification-changed',
    })
  }
  const registryContext = result.classified
  assertRecoveryOperationsMatch({
    classified: registryContext,
    snapshot: params.snapshot,
  })
  assertRecoveryProfilesComplete({
    classified: registryContext,
    profiles: params.snapshot.profiles,
  })
  const remainingNames = new Set(
    params.snapshot.remainingOperations.map(({ name }) => name),
  )
  const classified = registryContext.filter(({ domain }) =>
    remainingNames.has(domain.name),
  )
  if (classified.length !== remainingNames.size) {
    throw new MigrationRecoveryPlanError({
      message: 'The durable remaining migration operations are incomplete.',
      reason: 'operation-mismatch',
    })
  }
  return { registryContext, classified }
}

/**
 * Rebuild a migration plan from durable, data-only inputs after a page reload.
 * The old calldata is never trusted. Every action is reclassified, deployment
 * invariant is rechecked, and calls/receipt expectations are regenerated.
 */
export const buildMigrationRecoveryPlan = async (params: {
  readonly snapshot: MigrationRecoverySnapshot
  readonly hcaAddress: Address
  readonly migrationOwner: Address
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
}): Promise<MigrationPlan> => {
  const { snapshot, hcaAddress, migrationOwner, publicClient, signal } = params
  signal?.throwIfAborted()
  const { registryContext, classified } = classifyMigrationRecoverySnapshot({
    snapshot,
    migrationOwner,
  })

  const chainId = requireChainId(publicClient, 'migration')
  const needsOwnedPermRes = registryContext.some(
    (name) => name.resolverStrategy === 'to-owned-permres',
  )
  const expectedOwnedPermRes = needsOwnedPermRes
    ? computeResolverAddress({ chainId, hca: hcaAddress })
    : null
  if (
    (expectedOwnedPermRes === null) !== (snapshot.ownedPermRes === null) ||
    (expectedOwnedPermRes !== null &&
      snapshot.ownedPermRes !== null &&
      !isAddressEqual(expectedOwnedPermRes, snapshot.ownedPermRes))
  ) {
    throw new MigrationRecoveryPlanError({
      message:
        'The durable migration resolver does not match the deterministic HCA resolver.',
      reason: 'resolver-mismatch',
    })
  }

  const directNames = classified.filter(
    (name): name is DirectClassifiedName => name.action === 'migrate',
  )
  await assertLockedPublicResolverSetMembership({
    publicClient,
    names: classified,
  })
  signal?.throwIfAborted()
  const [directRoutes, hcaReadiness, resolverReadiness] = await Promise.all([
    resolveDirectMigrationRoutes({ publicClient, classified: directNames }),
    checkMigrationHcaReadiness({
      publicClient,
      hca: hcaAddress,
      expectedOwner: migrationOwner,
    }),
    needsOwnedPermRes
      ? checkDeterministicMigrationResolverReadiness({
          publicClient,
          hca: hcaAddress,
          wallet: migrationOwner,
        })
      : Promise.resolve({ status: 'not-required' } as const),
  ])
  signal?.throwIfAborted()

  await assertRequiredMigrationContractCode({
    publicClient,
    contracts: getRequiredMigrationContracts({
      remaining: classified,
      registryContext,
      directRoutes,
      hcaReadiness,
      resolverReadiness,
      ownedResolver: expectedOwnedPermRes,
    }),
  })
  signal?.throwIfAborted()

  const scope: MigrationBatchJournalScope = {
    chainId,
    owner: migrationOwner,
    hca: hcaAddress,
  }
  const expectedActions = new Map(
    snapshot.registryOperations.map(({ name, action }) => [name, action]),
  )
  const journaledOperations = [
    ...loadPendingAtomicMigrationIntents(scope),
    ...loadSubmittedAtomicMigrationBatches(scope),
  ].flatMap(({ operations }) => operations)
  const durableTreeOperations = journaledOperations.filter(({ name }) =>
    expectedActions.has(name),
  )
  const mismatchedAttempt = durableTreeOperations.find(
    ({ name, action }) => expectedActions.get(name) !== action,
  )
  if (mismatchedAttempt) {
    throw new MigrationRecoveryPlanError({
      message: `The journaled ${mismatchedAttempt.action} action for ${mismatchedAttempt.name} does not match the durable migration tree.`,
      reason: 'operation-mismatch',
    })
  }
  const recordedAttemptNames = new Set(
    durableTreeOperations.map(({ name }) => name),
  )
  await assertCopyMigrationReadiness({
    publicClient,
    hca: hcaAddress,
    wallet: migrationOwner,
    remaining: classified,
    registryContext,
    recordedAttemptNames,
  })
  signal?.throwIfAborted()

  const classifiedByName = new Map(
    classified.map((name) => [name.domain.name, name] as const),
  )
  const atomicPlan = await buildAtomicMigrationBatches({
    chainId,
    hca: hcaAddress,
    wallet: migrationOwner,
    classified,
    registryContext,
    directRoutes,
    profiles: snapshot.profiles,
    defaultResolver: V2_CONTRACTS.DefaultResolver,
    resolverDeployed: resolverReadiness.status === 'verified',
    walletCoAdminGranted:
      resolverReadiness.status === 'verified' &&
      resolverReadiness.walletHasWildcardRoles,
    maxOuterGas: TARGET_GAS,
    estimateOuterGas: ({ names, innerExecutions }) =>
      previewAtomicBatchGas({
        classifiedByName,
        profiles: snapshot.profiles,
        names,
        innerExecutions,
      }),
  })
  signal?.throwIfAborted()
  const groups = groupClassifiedNames([...classified])
  const plannedApprovals = snapshot.plannedApprovals.map((approval) =>
    migrationApprovalForId({
      id: approval.id,
      hcaAddress,
      ...(approval.tokenId === undefined ? {} : { tokenId: approval.tokenId }),
    }),
  )
  const hcaDeploymentRequired = hcaReadiness.status === 'deployment-required'
  const stepDescriptors = buildStepDescriptors({
    hcaDeploymentRequired,
    approvals: plannedApprovals,
    atomicBatches: atomicPlan.batches,
    registrationApprovalTargets: groups.unwrapped.map(({ domain }) => ({
      name: domain.name,
      tokenId: BigInt(domain.labelhash),
    })),
  })

  return {
    hcaAddress,
    hcaDeploymentRequired,
    migrationOwner,
    classified,
    registryContext,
    ineligible: [],
    groups,
    preflight: {
      skipFetchProfilesPhase: true,
      migrationApprovals: plannedApprovals,
      hcaResolverReadiness: resolverReadiness,
      ...(expectedOwnedPermRes
        ? { hcaResolverAddress: expectedOwnedPermRes }
        : {}),
      hcaReadiness,
      directMigrationRoutes: directRoutes,
    },
    ownedPermRes: expectedOwnedPermRes,
    profiles: snapshot.profiles,
    directRoutes,
    atomicBatches: atomicPlan.batches,
    stepDescriptors,
    priorCompletedOperations: snapshot.completedOperations,
    requiresReconciliation: true,
  }
}

export const adjustPlanForRetry = (
  plan: MigrationPlan,
  migratedNames: readonly string[],
): MigrationPlan => {
  if (migratedNames.length === 0) return plan
  const migratedSet = new Set(migratedNames)
  const remainingClassified = plan.classified.filter(
    (c) => !migratedSet.has(c.domain.name),
  )

  if (remainingClassified.length === 0) {
    return {
      ...plan,
      classified: [],
      atomicBatches: [],
      stepDescriptors: [],
    }
  }

  const groups = groupClassifiedNames(remainingClassified)
  const remainingAtomicBatches = plan.atomicBatches
    .map((batch) => {
      const nameExecutions = batch.nameExecutions.filter((execution) =>
        remainingClassified.includes(execution.classified),
      )
      const innerExecutions = buildAtomicMigrationInnerExecutions({
        nameExecutions,
      })
      return {
        ...batch,
        names: nameExecutions.map(
          (execution) => execution.classified.domain.name,
        ),
        operations: nameExecutions.map(({ classified }) => ({
          name: classified.domain.name,
          action: classified.action,
        })),
        nameExecutions,
        innerExecutions,
        outerCall: buildHcaOwnerExecutionCall({
          hca: plan.hcaAddress,
          calls: innerExecutions.map((execution) => execution.call),
        }),
        verificationExpectations: nameExecutions.flatMap(
          (execution) => execution.verificationExpectations,
        ),
      }
    })
    .filter((batch) => batch.names.length > 0)

  const stepDescriptors = buildStepDescriptors({
    hcaDeploymentRequired: plan.hcaDeploymentRequired,
    approvals: plan.preflight.migrationApprovals ?? [],
    atomicBatches: remainingAtomicBatches,
    registrationApprovalTargets: groups.unwrapped.map(({ domain }) => ({
      name: domain.name,
      tokenId: BigInt(domain.labelhash),
    })),
  })

  return {
    ...plan,
    classified: remainingClassified,
    groups,
    atomicBatches: remainingAtomicBatches,
    stepDescriptors,
  }
}
