import { requireChainId } from '@ens-apps/config'
import type { V1Domain } from '@ens-apps/migration'
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
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  GAS_HEURISTIC,
  GRANT_ROLES_GAS,
  MULTICALL_OVERHEAD,
  maxOuterGasFor,
  PER_BATCH_OVERHEAD,
  SETABI_GAS,
  SETADDR_GAS,
  SETCONTENTHASH_GAS,
  SETINTERFACE_GAS,
  SETTEXT_GAS,
} from './batchMigrate.constants'
import {
  type AtomicMigrationBatch,
  type AtomicMigrationInnerExecution,
  buildAtomicMigrationBatches,
  buildAtomicMigrationInnerExecutions,
  buildAtomicMigrationWalletCall,
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
  withManagerRestorationOptIn,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { assertCopyMigrationReadiness } from './copyMigrationReadiness'
import {
  type DirectMigrationRoute,
  resolveDirectMigrationRoutes,
} from './directMigrationRoutes'
import { resolverFor } from './encodeMigration'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import {
  hasTemporaryMigrationHcaApproval,
  type MigrationApproval,
  type MigrationApprovalReview,
  type MigrationCleanupApproval,
  type MigrationRegistrationApprovalStrategy,
  migrationApprovalForId,
  requiresMigrationApprovalCleanup,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'
import {
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  type MigrationBatchJournalScope,
  type MigrationJournalOperation,
  type MigrationRecoverySnapshot,
  type TemporaryRegistrationApproval,
} from './migrationBatchJournal'
import {
  assertRequiredMigrationContractCode,
  checkDeterministicMigrationResolverReadiness,
  checkMigrationHcaReadiness,
  getRequiredMigrationContracts,
  resolveLockedMigrationResolvers,
  resolverWriterFor,
} from './migrationInvariants'
import { checkRetainedManagerResolvers } from './retainedManagerResolver'
import {
  applySubnameRecreation,
  assertSubnameRecreationUnchanged,
  type SubnameRecreationSnapshot,
} from './subnameRecreation'
import { SubnameRecreationError } from './subnameRecreationError'
import { getV1ProfileKeys, type V1ProfileKeys } from './v1ProfileKeys'

export type MigrationPlan = {
  readonly registrationApprovalStrategy?: MigrationRegistrationApprovalStrategy
  readonly registrationApprovalReview?: MigrationApprovalReview
  readonly temporaryRegistrationApproval?: TemporaryRegistrationApproval
  readonly requiresFreshPreviewAfterCleanup?: true
  readonly subnameRecreation?: SubnameRecreationSnapshot
  /** Recovery may reconcile receipts and clean up even while rollout is off. */
  readonly isSubnameRecreationEnabled?: boolean
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
  /** The owner wallet bundles calls atomically (EIP-5792); see buildStepDescriptors. */
  readonly canBatchAtomically?: boolean
}

/** Names whose V1 `pubkey` record is dropped: the V2 PermissionedResolver has no pubkey profile. */
export const namesWithDroppedPubkey = (
  plan: Pick<MigrationPlan, 'classified' | 'profiles'>,
): readonly string[] =>
  plan.classified
    .filter(
      (name) =>
        name.resolverStrategy === 'to-owned-permres' &&
        !!plan.profiles.get(profileMapKey(namehash(name.domain.name)))?.pubkey,
    )
    .map(({ domain }) => domain.name)

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
        name: n.domain.name,
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
  'subregistry-attachment': 80_000n,
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
    BigInt(profile.abis.length) * SETABI_GAS +
    BigInt(profile.interfaces.length) * SETINTERFACE_GAS
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

const sumExecutionGas = (params: {
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly executions: readonly AtomicMigrationInnerExecution[]
}): bigint =>
  params.executions.reduce(
    (gas, execution) =>
      gas +
      innerExecutionGas({
        execution,
        classifiedByName: params.classifiedByName,
        profiles: params.profiles,
      }),
    0n,
  )

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

  return (
    PER_BATCH_OVERHEAD +
    nameGas +
    sumExecutionGas({
      classifiedByName: params.classifiedByName,
      profiles: params.profiles,
      executions: params.innerExecutions,
    })
  )
}

/**
 * Gas for the owner-wallet record replay, which is a plain transaction rather
 * than a wrapped `executeByOwner` call.
 */
const previewWalletReplayGas = (params: {
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly walletExecutions: readonly AtomicMigrationInnerExecution[]
}): bigint =>
  sumExecutionGas({ ...params, executions: params.walletExecutions })

/**
 * The batch's own gas plus the replay the owner wallet sends. Both preview and
 * execution split them the same way: `outerGas` is capped by `maxOuterGas`,
 * `walletGas` is a plain EOA transaction.
 */
const previewBatchGas = (params: {
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly names: readonly string[]
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
  readonly walletExecutions: readonly AtomicMigrationInnerExecution[]
}): { readonly outerGas: bigint; readonly walletGas: bigint } => ({
  outerGas: previewAtomicBatchGas(params),
  walletGas: previewWalletReplayGas(params),
})

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
  readonly interfaceRecordCount?: number
  readonly pubkeyRecordCount?: number
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
    | 'approval-mismatch'
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
        name: name.domain.name,
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
      profile.abis.length === 0 &&
      profile.interfaces.length === 0 &&
      profile.pubkey === null
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
      interfaceRecordCount: profile.interfaces.length,
      pubkeyRecordCount: profile.pubkey ? 1 : 0,
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
    candidates.map(({ name, v1Resolver }) => ({
      id: name.domain.id,
      name: name.domain.name,
      resolver: v1Resolver,
    })),
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
  subnameRecreation?: {
    readonly snapshot: SubnameRecreationSnapshot
  }
  hcaAddress: Address
  migrationOwner: Address
  /** Names whose ENSv1 registry controller the owner chose to keep as manager. */
  managerRestorationNames?: readonly string[]
  publicClient: PublicClient
  preflight: MigrationPreflight
  /** The owner wallet bundles calls atomically (EIP-5792). */
  canBatchAtomically?: boolean
  /** Names whose expiry projects a pending renewal; only fee previews pass this. */
  projectedExpiryNames?: ReadonlySet<string>
  signal?: AbortSignal
}): Promise<MigrationPlan> => {
  const {
    domains,
    hcaAddress,
    migrationOwner,
    managerRestorationNames = [],
    publicClient,
    preflight,
    canBatchAtomically = false,
    signal,
  } = params
  signal?.throwIfAborted()

  const classifiedNamesResult = classifyNames(
    [...domains],
    migrationOwner,
    envConfig.chain.id,
  )
  // Classification never appoints a manager on its own: a v1 registry
  // controller that differs from the registrant is only carried across for the
  // names the owner explicitly opted in for.
  const ordinaryClassified = await resolveLockedMigrationResolvers({
    publicClient,
    names: withManagerRestorationOptIn(
      classifiedNamesResult.classified,
      managerRestorationNames,
    ),
  })
  signal?.throwIfAborted()
  const classified = params.subnameRecreation
    ? applySubnameRecreation({
        domains,
        classified: ordinaryClassified,
        snapshot: params.subnameRecreation.snapshot,
        owner: migrationOwner,
      })
    : ordinaryClassified
  if (params.subnameRecreation)
    await assertSubnameRecreationUnchanged({
      publicClient,
      snapshot: params.subnameRecreation.snapshot,
      domains,
    })
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
  const directMigrationExpiries = await assertCopyMigrationReadiness({
    publicClient,
    hca: hcaAddress,
    wallet: migrationOwner,
    remaining: classified,
    registryContext: classified,
    projectedExpiryNames: params.projectedExpiryNames,
  })
  signal?.throwIfAborted()
  if (params.subnameRecreation)
    await assertRequiredMigrationContractCode({
      publicClient,
      contracts: [
        'UserRegistryImpl',
        'VerifiableFactoryProxyLogic',
        'PermissionedResolverImpl',
      ],
    })
  const ineligible = classifiedNamesResult.ineligible.filter(
    ({ domain }) =>
      !classified.some((name) => name.domain.name === domain.name),
  )
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
  const resolverWriter = resolverWriterFor(preflight.hcaResolverReadiness)
  const atomicPlan = await buildAtomicMigrationBatches({
    directMigrationExpiries,
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
    resolverWriter,
    deployedManagerResolvers: await checkRetainedManagerResolvers({
      publicClient,
      chainId: requireChainId(publicClient, 'migration'),
      hca: hcaAddress,
      wallet: migrationOwner,
      classified,
    }),
    maxOuterGas: maxOuterGasFor(canBatchAtomically),
    estimateBatchGas: ({ names, innerExecutions, walletExecutions }) =>
      previewBatchGas({
        classifiedByName,
        profiles,
        names,
        innerExecutions,
        walletExecutions,
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
    cleanupApprovals: preflight.migrationCleanupApprovals,
    atomicBatches: atomicPlan.batches,
    registrationApprovalTargets,
    canBatchAtomically,
  })

  return {
    hcaAddress,
    hcaDeploymentRequired,
    migrationOwner,
    subnameRecreation: params.subnameRecreation?.snapshot,
    registrationApprovalStrategy: preflight.registrationApprovalStrategy,
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
    canBatchAtomically,
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
  // The opt-in is replayed from the durable snapshot, never re-derived: the
  // resumed run must grant exactly what the first attempt planned.
  const ordinaryDomains = params.snapshot.subnameRecreation
    ? params.snapshot.registryDomains.filter(
        (domain) =>
          !params.snapshot.subnameRecreation?.roots.some((root) =>
            domain.name.endsWith(`.${root}`),
          ),
      )
    : params.snapshot.registryDomains
  const result = classifyNames(
    [...ordinaryDomains],
    params.migrationOwner,
    envConfig.chain.id,
  )
  const withOptIn = withManagerRestorationOptIn(
    result.classified,
    params.snapshot.managerRestorationNames,
  )
  if (
    result.ineligible.length > 0 ||
    result.classified.length !== ordinaryDomains.length
  ) {
    throw new MigrationRecoveryPlanError({
      message:
        'The durable migration source data no longer produces the complete selected tree.',
      reason: 'classification-changed',
    })
  }
  const recreate = (): readonly ClassifiedName[] => {
    try {
      return applySubnameRecreation({
        domains: params.snapshot.registryDomains,
        classified: withOptIn,
        snapshot: params.snapshot
          .subnameRecreation as SubnameRecreationSnapshot,
        owner: params.migrationOwner,
      })
    } catch (cause) {
      if (!(cause instanceof SubnameRecreationError)) throw cause
      throw new MigrationRecoveryPlanError({
        message: cause.message,
        reason: 'classification-changed',
      })
    }
  }
  const registryContext = params.snapshot.subnameRecreation
    ? recreate()
    : withOptIn
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
  for (const root of params.snapshot.subnameRecreation?.roots ?? []) {
    const tree = registryContext.filter(
      ({ domain }) => domain.name === root || domain.name.endsWith(`.${root}`),
    )
    const remaining = tree.filter(({ domain }) =>
      remainingNames.has(domain.name),
    )
    if (remaining.length && remaining.length !== tree.length)
      throw new MigrationRecoveryPlanError({
        message: `Recreation tree "${root}" is only partially complete; reconcile the confirmed receipt before continuing.`,
        reason: 'operation-mismatch',
      })
  }
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

const getRegistrationRecoveryCleanup = (params: {
  readonly snapshot: MigrationRecoverySnapshot
  readonly baseRegistrar: Address
}): MigrationCleanupApproval | undefined => {
  const approval = params.snapshot.temporaryRegistrationApproval
  if (!approval) return undefined
  if (!isAddressEqual(approval.contractAddress, params.baseRegistrar)) {
    throw new MigrationRecoveryPlanError({
      message:
        'The saved registration permission does not target the trusted registrar.',
      reason: 'approval-mismatch',
    })
  }
  return {
    kind: 'operator',
    id: 'base-registrar:hca',
    contractAddress: approval.contractAddress,
    operatorAddress: approval.operatorAddress,
  }
}

const hasRegistrationHelperChanged = (params: {
  readonly snapshot: MigrationRecoverySnapshot
  readonly migrationHelper: Address
}): boolean => {
  const recordedHelper =
    params.snapshot.temporaryRegistrationApproval?.operatorAddress ??
    params.snapshot.registrationApprovalReview?.operatorAddress
  return (
    recordedHelper !== undefined &&
    !isAddressEqual(recordedHelper, params.migrationHelper)
  )
}

const buildChangedHelperCleanupPlan = async (params: {
  readonly snapshot: MigrationRecoverySnapshot
  readonly hcaAddress: Address
  readonly migrationOwner: Address
  readonly publicClient: PublicClient
  readonly registryContext: readonly ClassifiedName[]
  readonly registrationCleanup?: MigrationCleanupApproval
}): Promise<MigrationPlan> => {
  const { snapshot, hcaAddress, migrationOwner, publicClient } = params
  const hasHcaApproval = await hasTemporaryMigrationHcaApproval({
    publicClient,
    eoa: migrationOwner,
    hcaAddress,
  })
  const migrationCleanupApprovals = [
    ...(hasHcaApproval ? [temporaryMigrationHcaApproval(hcaAddress)] : []),
    ...(params.registrationCleanup ? [params.registrationCleanup] : []),
  ]
  return {
    hcaAddress,
    hcaDeploymentRequired: false,
    migrationOwner,
    classified: [],
    registryContext: params.registryContext,
    ineligible: [],
    groups: groupClassifiedNames([]),
    preflight: {
      skipFetchProfilesPhase: true,
      migrationApprovals: [],
      migrationCleanupApprovals,
    },
    ownedPermRes: snapshot.ownedPermRes,
    profiles: snapshot.profiles,
    directRoutes: new Map(),
    atomicBatches: [],
    stepDescriptors: buildStepDescriptors({
      hcaDeploymentRequired: false,
      approvals: [],
      cleanupApprovals: migrationCleanupApprovals,
      atomicBatches: [],
      registrationApprovalTargets: [],
    }),
    priorCompletedOperations: snapshot.completedOperations,
    subnameRecreation: snapshot.subnameRecreation,
    requiresReconciliation: true,
    canBatchAtomically: false,
    registrationApprovalStrategy: snapshot.registrationApprovalStrategy,
    registrationApprovalReview: snapshot.registrationApprovalReview,
    temporaryRegistrationApproval: snapshot.temporaryRegistrationApproval,
    requiresFreshPreviewAfterCleanup: true,
  }
}

const buildRecoveryApprovalPlan = (params: {
  readonly snapshot: MigrationRecoverySnapshot
  readonly hcaAddress: Address
  readonly groups: GroupedNames
  readonly hasRemainingNames: boolean
  readonly registrationCleanup?: MigrationCleanupApproval
}) => {
  // With nothing left to migrate no grant runs, so cleanup follows live state.
  const remainingApprovals = params.hasRemainingNames
    ? params.snapshot.plannedApprovals
    : []
  const plannedApprovals = remainingApprovals.flatMap((approval) => {
    // Older recovery snapshots may contain the collection-wide strategy. A
    // resumed run must retain the legacy token-scoped strategy instead.
    if (
      approval.id === 'base-registrar:hca' &&
      params.snapshot.registrationApprovalStrategy !== 'temporary-operator'
    ) {
      return params.groups.unwrapped.map(({ domain }) =>
        migrationApprovalForId({
          id: 'base-registrar:hca-token',
          hcaAddress: params.hcaAddress,
          tokenId: BigInt(domain.labelhash),
        }),
      )
    }
    return [
      migrationApprovalForId({
        id: approval.id,
        hcaAddress: params.hcaAddress,
        ...(approval.tokenId === undefined
          ? {}
          : { tokenId: approval.tokenId }),
      }),
    ]
  })
  const registrationCleanupApprovals = params.registrationCleanup
    ? [params.registrationCleanup]
    : params.snapshot.registrationApprovalStrategy === 'temporary-operator'
      ? plannedApprovals
          .filter(requiresMigrationApprovalCleanup)
          .filter(({ id }) => id === 'base-registrar:hca')
      : []
  return { plannedApprovals, registrationCleanupApprovals }
}

const buildRecoveryCleanupApprovals = async (params: {
  readonly hcaAddress: Address
  readonly migrationOwner: Address
  readonly publicClient: PublicClient
  readonly plannedApprovals: readonly MigrationApproval[]
  readonly registrationCleanupApprovals: readonly MigrationCleanupApproval[]
}): Promise<readonly MigrationCleanupApproval[]> => {
  const willGrantHcaApproval = params.plannedApprovals.some(
    ({ id }) => id === 'eth-registry:hca',
  )
  const needsHcaCleanup =
    willGrantHcaApproval ||
    (await hasTemporaryMigrationHcaApproval({
      publicClient: params.publicClient,
      eoa: params.migrationOwner,
      hcaAddress: params.hcaAddress,
    }))
  return [
    ...(needsHcaCleanup
      ? [temporaryMigrationHcaApproval(params.hcaAddress)]
      : []),
    ...params.registrationCleanupApprovals,
  ]
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
  readonly canBatchAtomically?: boolean
  readonly signal?: AbortSignal
}): Promise<MigrationPlan> => {
  const { snapshot, hcaAddress, migrationOwner, publicClient, signal } = params
  const canBatchAtomically =
    params.canBatchAtomically === true &&
    snapshot.registrationApprovalStrategy !== 'temporary-operator'
  signal?.throwIfAborted()
  const recovered = classifyMigrationRecoverySnapshot({
    snapshot,
    migrationOwner,
  })
  const temporaryRegistrationApproval = snapshot.temporaryRegistrationApproval
  const registrationCleanup = getRegistrationRecoveryCleanup({
    snapshot,
    baseRegistrar: V1_CONTRACTS.BaseRegistrar,
  })
  if (
    hasRegistrationHelperChanged({
      snapshot,
      migrationHelper: V2_CONTRACTS.MigrationHelper,
    })
  ) {
    return buildChangedHelperCleanupPlan({
      snapshot,
      hcaAddress,
      migrationOwner,
      publicClient,
      registryContext: recovered.registryContext,
      registrationCleanup,
    })
  }
  const classified = await resolveLockedMigrationResolvers({
    publicClient,
    names: recovered.classified,
  })
  signal?.throwIfAborted()
  const resolvedByName = new Map(
    classified.map((name) => [name.domain.name, name]),
  )
  const registryContext = recovered.registryContext.map(
    (name) => resolvedByName.get(name.domain.name) ?? name,
  )

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
  const directNames = classified.filter(
    (name): name is DirectClassifiedName => name.action === 'migrate',
  )
  await assertLockedResolverReplacementRecordSafety(
    classified.filter(({ domain }) => !recordedAttemptNames.has(domain.name)),
    publicClient,
    signal,
  )
  signal?.throwIfAborted()
  const [directRoutes, hcaReadiness, resolverReadiness] = await Promise.all([
    resolveDirectMigrationRoutes({ publicClient, classified: directNames }),
    recordedAttemptNames.size || classified.length === 0
      ? Promise.resolve({ status: 'deferred' as const, hca: hcaAddress })
      : checkMigrationHcaReadiness({
          publicClient,
          hca: hcaAddress,
          expectedOwner: migrationOwner,
        }),
    needsOwnedPermRes &&
    recordedAttemptNames.size === 0 &&
    classified.length > 0
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

  const directMigrationExpiries =
    classified.length > 0
      ? await assertCopyMigrationReadiness({
          publicClient,
          hca: hcaAddress,
          wallet: migrationOwner,
          remaining: classified,
          registryContext,
          recordedAttemptNames,
        })
      : new Map<string, bigint>()
  signal?.throwIfAborted()

  const classifiedByName = new Map(
    classified.map((name) => [name.domain.name, name] as const),
  )
  const atomicPlan = await buildAtomicMigrationBatches({
    directMigrationExpiries,
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
    // A journal does not persist the generic resolver's writer. Historical
    // completion requires the owner grant and copied values, without inventing
    // an HCA grant that could already have been revoked before the transaction.
    resolverWriter: recordedAttemptNames.size
      ? 'wallet'
      : resolverWriterFor(resolverReadiness),
    deployedManagerResolvers: await checkRetainedManagerResolvers({
      publicClient,
      chainId,
      hca: hcaAddress,
      wallet: migrationOwner,
      classified: classified.filter(
        ({ domain }) => !recordedAttemptNames.has(domain.name),
      ),
    }),
    maxOuterGas: maxOuterGasFor(canBatchAtomically),
    estimateBatchGas: ({ names, innerExecutions, walletExecutions }) =>
      previewBatchGas({
        classifiedByName,
        profiles: snapshot.profiles,
        names,
        innerExecutions,
        walletExecutions,
      }),
  })
  signal?.throwIfAborted()
  const groups = groupClassifiedNames([...classified])
  const { plannedApprovals, registrationCleanupApprovals } =
    buildRecoveryApprovalPlan({
      snapshot,
      hcaAddress,
      groups,
      hasRemainingNames: classified.length > 0,
      registrationCleanup,
    })
  const migrationCleanupApprovals = await buildRecoveryCleanupApprovals({
    hcaAddress,
    migrationOwner,
    publicClient,
    plannedApprovals,
    registrationCleanupApprovals,
  })
  const hcaDeploymentRequired = hcaReadiness.status === 'deployment-required'
  const stepDescriptors = buildStepDescriptors({
    hcaDeploymentRequired,
    approvals: plannedApprovals,
    cleanupApprovals: migrationCleanupApprovals,
    atomicBatches: atomicPlan.batches,
    registrationApprovalTargets: groups.unwrapped.map(({ domain }) => ({
      name: domain.name,
      tokenId: BigInt(domain.labelhash),
    })),
    canBatchAtomically,
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
      registrationApprovalStrategy: snapshot.registrationApprovalStrategy,
      migrationApprovals: plannedApprovals,
      migrationCleanupApprovals,
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
    subnameRecreation: snapshot.subnameRecreation,
    requiresReconciliation: true,
    canBatchAtomically,
    registrationApprovalStrategy: snapshot.registrationApprovalStrategy,
    registrationApprovalReview: snapshot.registrationApprovalReview,
    temporaryRegistrationApproval,
  }
}

export const adjustPlanForRetry = (
  plan: MigrationPlan,
  migratedNames: readonly string[],
): MigrationPlan => {
  if (migratedNames.length === 0) return plan
  const migratedSet = new Set(migratedNames)
  for (const root of plan.subnameRecreation?.roots ?? []) {
    const tree = plan.classified.filter(
      ({ domain }) => domain.name === root || domain.name.endsWith(`.${root}`),
    )
    const completed = tree.filter(({ domain }) => migratedSet.has(domain.name))
    if (completed.length && completed.length !== tree.length) {
      throw new MigrationRecoveryPlanError({
        message: `Recreation tree "${root}" is only partially verified; reconcile its confirmed receipt before continuing.`,
        reason: 'operation-mismatch',
      })
    }
  }
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
      const walletCall = plan.ownedPermRes
        ? buildAtomicMigrationWalletCall({
            resolver: plan.ownedPermRes,
            executions: nameExecutions.flatMap(
              (execution) => execution.walletExecutions,
            ),
          })
        : null
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
        walletCall,
        // Re-derived from the same upper-bound heuristic as `estimatedGas`.
        walletEstimatedGas: walletCall ? batch.walletEstimatedGas : 0n,
        verificationExpectations: nameExecutions.flatMap(
          (execution) => execution.verificationExpectations,
        ),
      }
    })
    .filter((batch) => batch.names.length > 0)

  const stepDescriptors = buildStepDescriptors({
    hcaDeploymentRequired: plan.hcaDeploymentRequired,
    approvals: plan.preflight.migrationApprovals ?? [],
    cleanupApprovals: plan.preflight.migrationCleanupApprovals,
    atomicBatches: remainingAtomicBatches,
    registrationApprovalTargets: groups.unwrapped.map(({ domain }) => ({
      name: domain.name,
      tokenId: BigInt(domain.labelhash),
    })),
    canBatchAtomically: plan.canBatchAtomically,
  })

  return {
    ...plan,
    classified: remainingClassified,
    groups,
    atomicBatches: remainingAtomicBatches,
    stepDescriptors,
  }
}
