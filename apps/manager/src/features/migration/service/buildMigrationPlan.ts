import {
  buildHcaOwnerExecutionCall,
  computeResolverAddress,
} from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { type Address, type Hex, namehash, type PublicClient } from 'viem'

import { V2_CONTRACTS } from '../contracts/addresses'
import {
  GAS_HEURISTIC,
  GRANT_ROLES_GAS,
  MULTICALL_OVERHEAD,
  PER_BATCH_OVERHEAD,
  SETADDR_GAS,
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
  FUSES,
  type GroupedNames,
  groupClassifiedNames,
  hasFuse,
  type IneligibleName,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import {
  type DirectMigrationRoute,
  resolveDirectMigrationRoutes,
} from './directMigrationRoutes'
import { resolverFor } from './encodeMigration'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import { getV1ProfileKeys, type V1Domain } from './v1SubgraphClient'

export type MigrationPlan = {
  readonly hcaAddress: Address
  readonly hcaDeploymentRequired: boolean
  readonly migrationOwner: Address
  readonly domains: readonly V1Domain[]
  readonly classified: readonly ClassifiedName[]
  readonly ineligible: readonly IneligibleName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly ownedPermRes: Address | null
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly directRoutes: ReadonlyMap<string, DirectMigrationRoute>
  readonly atomicBatches: readonly AtomicMigrationBatch[]
  readonly stepDescriptors: readonly MigrationStepDescriptor[]
}

const fetchProfilesForNames = async (params: {
  namesToOwnedPermRes: readonly ClassifiedName[]
  preflight: MigrationPreflight
  publicClient: PublicClient
}): Promise<Map<Hex, Profile>> => {
  const { namesToOwnedPermRes, preflight, publicClient } = params
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
  })
}

const previewAtomicBatchGas = (params: {
  readonly classifiedByName: ReadonlyMap<string, ClassifiedName>
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly names: readonly string[]
  readonly innerExecutions: readonly AtomicMigrationInnerExecution[]
}): bigint => {
  let gas = PER_BATCH_OVERHEAD

  for (const name of params.names) {
    const classified = params.classifiedByName.get(name)
    if (!classified) continue
    gas += GAS_HEURISTIC[classified.tokenType]
  }

  for (const execution of params.innerExecutions) {
    switch (execution.phase) {
      case 'resolver-deployment':
        gas += 240_000n
        break
      case 'wallet-co-admin-grant':
        gas += 70_000n
        break
      case 'manager-role-grant':
        gas += GRANT_ROLES_GAS
        break
      case 'profile-replay': {
        const classified = params.classifiedByName.get(execution.name)
        if (!classified) break
        const profile = params.profiles.get(
          profileMapKey(namehash(classified.domain.name)),
        )
        if (!profile) break
        gas += MULTICALL_OVERHEAD
        gas += BigInt(profile.texts.length) * SETTEXT_GAS
        gas += BigInt(profile.addresses.length) * SETADDR_GAS
        break
      }
      case 'migrate':
        // Included above via GAS_HEURISTIC.
        break
    }
  }

  return gas
}

export class LockedResolverRecordSafetyError extends TaggedError(
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
  readonly cause?: unknown
}> {}

const lockedResolverReplacementsWithoutAtomicReplay = (
  classified: readonly ClassifiedName[],
): readonly {
  readonly name: ClassifiedName
  readonly v1Resolver: Address
  readonly replacementResolver: Address
}[] =>
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

/**
 * The locked receiver can rotate an allowlisted public resolver even though
 * CANNOT_SET_RESOLVER is burned, but the current atomic plan cannot replay
 * records into the shared PublicResolverV2. Permit that rotation only after
 * proving the supported text/address inventory is empty.
 */
export const assertLockedResolverReplacementRecordSafety = async (
  classified: readonly ClassifiedName[],
): Promise<void> => {
  const candidates = lockedResolverReplacementsWithoutAtomicReplay(classified)
  if (candidates.length === 0) return

  const result = await getV1ProfileKeys(
    candidates.map(({ name }) => name.domain.id),
  )
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

  const inventories = new Map(
    result.value.map((keys) => [keys.id.toLowerCase(), keys] as const),
  )

  for (const candidate of candidates) {
    const inventory = inventories.get(candidate.name.domain.id.toLowerCase())
    if (!inventory) {
      throw new LockedResolverRecordSafetyError({
        message: `The record inventory for "${candidate.name.domain.name}" is incomplete; migration is blocked to prevent record loss`,
        ensName: candidate.name.domain.name,
        v1Resolver: candidate.v1Resolver,
        replacementResolver: candidate.replacementResolver,
        reason: 'inventory-missing',
      })
    }
    if (inventory.texts.length > 0 || inventory.coinTypes.length > 0) {
      throw new LockedResolverRecordSafetyError({
        message: `"${candidate.name.domain.name}" has records that cannot be replayed atomically during its locked resolver replacement`,
        ensName: candidate.name.domain.name,
        v1Resolver: candidate.v1Resolver,
        replacementResolver: candidate.replacementResolver,
        reason: 'records-not-replayable',
        textRecordCount: inventory.texts.length,
        addressRecordCount: inventory.coinTypes.length,
      })
    }
  }
}

export const buildMigrationPlan = async (params: {
  domains: readonly V1Domain[]
  hcaAddress: Address
  migrationOwner: Address
  publicClient: PublicClient
  preflight: MigrationPreflight
}): Promise<MigrationPlan> => {
  const { domains, hcaAddress, migrationOwner, publicClient, preflight } =
    params

  const classifiedNamesResult = classifyNames([...domains], migrationOwner)
  const classified = classifiedNamesResult.classified
  await assertLockedResolverReplacementRecordSafety(classified)
  const directRoutes =
    preflight.directMigrationRoutes ??
    (await resolveDirectMigrationRoutes({ publicClient, classified }))
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
        chainId: publicClient.chain?.id ?? 11155111,
        hca: hcaAddress,
      })
  }

  const profiles = await fetchProfilesForNames({
    namesToOwnedPermRes,
    preflight,
    publicClient,
  })

  const classifiedByName = new Map(
    classified.map((name) => [name.domain.name, name] as const),
  )
  const resolverDeployed = preflight.hcaResolverReadiness?.status === 'verified'
  const walletCoAdminGranted =
    preflight.hcaResolverReadiness?.status === 'verified' &&
    preflight.hcaResolverReadiness.walletHasWildcardRoles
  const atomicPlan = await buildAtomicMigrationBatches({
    chainId: publicClient.chain?.id ?? 11155111,
    hca: hcaAddress,
    wallet: migrationOwner,
    classified,
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
    domains,
    classified,
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

export const adjustPlanForRetry = (
  plan: MigrationPlan,
  migratedNames: readonly string[],
): MigrationPlan => {
  if (migratedNames.length === 0) return plan
  const migratedSet = new Set(migratedNames)
  const remainingClassified = plan.classified.filter(
    (c) => !migratedSet.has(c.domain.name),
  )
  const remainingDomains = plan.domains.filter((d) => !migratedSet.has(d.name))

  if (remainingClassified.length === 0) {
    return {
      ...plan,
      classified: [],
      domains: remainingDomains,
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
    domains: remainingDomains,
    groups,
    atomicBatches: remainingAtomicBatches,
    stepDescriptors,
  }
}
