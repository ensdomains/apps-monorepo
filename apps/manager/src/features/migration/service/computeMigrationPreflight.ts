import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import {
  type ClassifiedName,
  classifyNames,
  groupClassifiedNames,
} from '@/features/migration/service/classifyNames'
import {
  type DirectMigrationRoute,
  resolveDirectMigrationRoutes,
} from '@/features/migration/service/directMigrationRoutes'
import { ProfileFetchError } from '@/features/migration/service/fetchV1Profiles'
import { approvalNeedsFor } from '@/features/migration/service/migrationApprovalNeeds'
import {
  checkMigrationApprovals,
  type MigrationApproval,
  type MigrationApprovalStatus,
  type MigrationCleanupApproval,
  planMigrationApprovalCleanup,
  planMigrationApprovals,
} from '@/features/migration/service/migrationApprovals'
import {
  assertLockedPublicResolverSetMembership,
  assertMigrationHelperRuntimeCode,
  assertRequiredMigrationContractCode,
  checkDeterministicMigrationResolverReadiness,
  checkMigrationHcaReadiness,
  getMigrationResolverAddress,
  type MigrationHcaReadiness,
  type MigrationResolverReadiness,
} from '@/features/migration/service/migrationInvariants'
import type {
  V1Domain,
  V1ProfileKeys,
} from '@/features/migration/service/v1SubgraphClient'
import {
  getV1ProfileKeys,
  hasV1ProfileRecords,
} from '@/features/migration/service/v1SubgraphClient'

export type MigrationPreflight = {
  preExistingOwnedPermRes: Address | null
  skipApprovalPhase: boolean
  skipFetchProfilesPhase: boolean
  baseRegistrarApproved: boolean
  nameWrapperApproved: boolean
  /** HCA-specific approval state, populated when an HCA address is available. */
  hcaApprovalStatus?: MigrationApprovalStatus
  /** Missing grants required by the current migration. */
  migrationApprovals?: readonly MigrationApproval[]
  /** Historical direct-HCA permissions that must be revoked before migration. */
  migrationCleanupApprovals?: readonly MigrationCleanupApproval[]
  /** Deterministic HCA resolver, including deploy/role readiness. */
  hcaResolverReadiness?: MigrationResolverReadiness
  hcaResolverAddress?: Address
  /** Owner-execution readiness for the counterfactual HCA. */
  hcaReadiness?: MigrationHcaReadiness
  /** Factory-certified helper receiver for every selected name. */
  directMigrationRoutes?: ReadonlyMap<string, DirectMigrationRoute>
  profileKeys?: readonly V1ProfileKeys[]
}

export const EMPTY_PREFLIGHT: MigrationPreflight = {
  preExistingOwnedPermRes: null,
  skipApprovalPhase: false,
  skipFetchProfilesPhase: false,
  baseRegistrarApproved: false,
  nameWrapperApproved: false,
}

type ApprovalNeeds = ReturnType<typeof approvalNeedsFor>

const computeResolverPreflight = async (params: {
  readonly eoa: Address
  readonly hcaAddress?: Address
  readonly needsOwnedPermRes: boolean
  readonly publicClient: PublicClient
}): Promise<{
  readonly preExistingOwnedPermRes: Address | null
  readonly hcaResolverReadiness?: MigrationResolverReadiness
  readonly hcaResolverAddress?: Address
}> => {
  const { eoa, hcaAddress, needsOwnedPermRes, publicClient } = params
  if (!needsOwnedPermRes) return { preExistingOwnedPermRes: null }

  if (!hcaAddress) return { preExistingOwnedPermRes: null }

  const hcaResolverAddress = getMigrationResolverAddress(hcaAddress)
  const hcaResolverReadiness =
    await checkDeterministicMigrationResolverReadiness({
      publicClient,
      hca: hcaAddress,
      wallet: eoa,
    })
  return {
    preExistingOwnedPermRes:
      hcaResolverReadiness.status === 'verified'
        ? hcaResolverReadiness.resolver
        : null,
    hcaResolverReadiness,
    hcaResolverAddress,
  }
}

const computeApprovalPreflight = async (params: {
  readonly eoa: Address
  readonly hcaAddress?: Address
  readonly needs: ApprovalNeeds
  readonly wagmiConfig: WagmiConfig
}): Promise<{
  readonly skipApprovalPhase: boolean
  readonly baseRegistrarApproved: boolean
  readonly nameWrapperApproved: boolean
  readonly hcaApprovalStatus?: MigrationApprovalStatus
  readonly migrationApprovals?: readonly MigrationApproval[]
  readonly migrationCleanupApprovals?: readonly MigrationCleanupApproval[]
}> => {
  const { eoa, hcaAddress, needs, wagmiConfig } = params
  if (!hcaAddress) {
    return {
      skipApprovalPhase: false,
      baseRegistrarApproved: false,
      nameWrapperApproved: false,
    }
  }

  const hcaApprovalStatus = await checkMigrationApprovals({
    eoa,
    hcaAddress,
    needs,
    wagmiConfig,
  })
  const migrationApprovals = planMigrationApprovals({
    hcaAddress,
    needs,
    status: hcaApprovalStatus,
  })
  const migrationCleanupApprovals = planMigrationApprovalCleanup({
    hcaAddress,
    status: hcaApprovalStatus,
  })
  return {
    skipApprovalPhase: migrationApprovals.length === 0,
    baseRegistrarApproved:
      hcaApprovalStatus.baseRegistrarHcaApproved ||
      hcaApprovalStatus.unwrappedTokenApprovals.every(
        ({ approved }) => approved,
      ),
    nameWrapperApproved: hcaApprovalStatus.nameWrapperHcaApproved,
    hcaApprovalStatus,
    migrationApprovals,
    migrationCleanupApprovals,
  }
}

const computeProfilePreflight = async (
  namesToOwnedPermRes: readonly ClassifiedName[],
): Promise<{
  readonly skipFetchProfilesPhase: boolean
  readonly profileKeys?: readonly V1ProfileKeys[]
}> => {
  const namesWithSourceResolver = namesToOwnedPermRes.filter(
    (name) => name.v1ResolverAddress !== null,
  )
  if (namesWithSourceResolver.length === 0) {
    return { skipFetchProfilesPhase: true }
  }

  const keysResult = await getV1ProfileKeys(
    namesWithSourceResolver.map((name) => name.domain.id),
  )
  if (keysResult.isErr()) {
    console.warn(
      '[migration] getV1ProfileKeys failed, defaulting to full profile fetch:',
      keysResult.error,
    )
    return { skipFetchProfilesPhase: false }
  }

  const profileKeys = keysResult.value
  const returnedIds = new Set(profileKeys.map((keys) => keys.id.toLowerCase()))
  const missingIds = [
    ...new Set(
      namesWithSourceResolver.map((name) => name.domain.id.toLowerCase()),
    ),
  ].filter((id) => !returnedIds.has(id))
  if (missingIds.length > 0) {
    throw new ProfileFetchError({
      phase: 'subgraph',
      cause: new Error(
        `Profile key inventory omitted ${missingIds.length} requested resolver-backed node${missingIds.length === 1 ? '' : 's'}`,
      ),
    })
  }
  const anyKeys = profileKeys.some(hasV1ProfileRecords)
  return { skipFetchProfilesPhase: !anyKeys, profileKeys }
}

export const computeMigrationPreflight = async (params: {
  eoa: Address
  hcaAddress?: Address
  domains: readonly V1Domain[]
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
}): Promise<MigrationPreflight> => {
  const { eoa, hcaAddress, domains, wagmiConfig, publicClient } = params

  const { classified } = classifyNames([...domains], eoa)
  const groups = groupClassifiedNames(classified)

  const needs = approvalNeedsFor(groups)
  if (classified.length === 0) {
    const approvalPreflight = await computeApprovalPreflight({
      eoa,
      hcaAddress,
      needs,
      wagmiConfig,
    })
    return {
      preExistingOwnedPermRes: null,
      skipFetchProfilesPhase: true,
      ...approvalPreflight,
      directMigrationRoutes: new Map(),
    }
  }

  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  const needsOwnedPermRes = namesToOwnedPermRes.length > 0

  const [
    resolverPreflight,
    approvalPreflight,
    profilePreflight,
    directMigrationRoutes,
    hcaReadiness,
  ] = await Promise.all([
    computeResolverPreflight({
      eoa,
      hcaAddress,
      needsOwnedPermRes,
      publicClient,
    }),
    computeApprovalPreflight({
      eoa,
      hcaAddress,
      needs,
      wagmiConfig,
    }),
    computeProfilePreflight(namesToOwnedPermRes),
    resolveDirectMigrationRoutes({ publicClient, classified }),
    hcaAddress
      ? (async () => {
          await assertRequiredMigrationContractCode({ publicClient })
          await assertMigrationHelperRuntimeCode({ publicClient })
          await assertLockedPublicResolverSetMembership({
            publicClient,
            names: classified,
          })
          return checkMigrationHcaReadiness({
            publicClient,
            hca: hcaAddress,
            expectedOwner: eoa,
          })
        })()
      : Promise.resolve(undefined),
  ])

  return {
    ...resolverPreflight,
    ...approvalPreflight,
    ...profilePreflight,
    directMigrationRoutes,
    hcaReadiness,
  }
}
