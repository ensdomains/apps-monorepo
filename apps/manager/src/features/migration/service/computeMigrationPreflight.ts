import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import {
  type ClassifiedName,
  classifyNames,
  type DirectClassifiedName,
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
  getGrantedMigrationCleanupApprovals,
  type MigrationApproval,
  type MigrationCleanupApproval,
  migrationApprovalKey,
  planMigrationApprovals,
  requiresMigrationApprovalCleanup,
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
  skipFetchProfilesPhase: boolean
  /** Missing grants only; confirmed operator entries remain available to the HCA. */
  migrationApprovals?: readonly MigrationApproval[]
  /**
   * Temporary HCA grants owed a revocation at the end of this run: grants
   * planned above plus standing grants left by an interrupted earlier
   * session. Execution re-derives the final set from live chain state; this
   * list keeps the step preview and gas estimate honest.
   */
  migrationApprovalCleanups?: readonly MigrationCleanupApproval[]
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
  skipFetchProfilesPhase: false,
}

type ApprovalNeeds = ReturnType<typeof approvalNeedsFor>

const computeResolverPreflight = async (params: {
  readonly eoa: Address
  readonly hcaAddress?: Address
  readonly needsOwnedPermRes: boolean
  readonly publicClient: PublicClient
}): Promise<{
  readonly hcaResolverReadiness?: MigrationResolverReadiness
  readonly hcaResolverAddress?: Address
}> => {
  const { eoa, hcaAddress, needsOwnedPermRes, publicClient } = params
  if (!needsOwnedPermRes) return {}

  if (!hcaAddress) return {}

  const hcaResolverAddress = getMigrationResolverAddress(hcaAddress)
  const hcaResolverReadiness =
    await checkDeterministicMigrationResolverReadiness({
      publicClient,
      hca: hcaAddress,
      wallet: eoa,
    })
  return {
    hcaResolverReadiness,
    hcaResolverAddress,
  }
}

const computeApprovalPreflight = async (params: {
  readonly eoa: Address
  readonly hcaAddress?: Address
  readonly needs: ApprovalNeeds
  readonly requiresManagerRestoration: boolean
  readonly wagmiConfig: WagmiConfig
  readonly publicClient: PublicClient
}): Promise<{
  readonly migrationApprovals?: readonly MigrationApproval[]
  readonly migrationApprovalCleanups?: readonly MigrationCleanupApproval[]
}> => {
  const {
    eoa,
    hcaAddress,
    needs,
    requiresManagerRestoration,
    wagmiConfig,
    publicClient,
  } = params
  if (!hcaAddress) return {}

  const [hcaApprovalStatus, grantedCleanups] = await Promise.all([
    checkMigrationApprovals({
      eoa,
      hcaAddress,
      needs: { ...needs, requiresManagerRestoration },
      wagmiConfig,
    }),
    // Read unconditionally: an interrupted earlier session may have left a
    // temporary grant standing even when this run does not need it.
    getGrantedMigrationCleanupApprovals({ eoa, hcaAddress, publicClient }),
  ])
  const migrationApprovals = planMigrationApprovals({
    hcaAddress,
    needs: { ...needs, requiresManagerRestoration },
    status: hcaApprovalStatus,
  })
  const cleanupByKey = new Map(
    [
      ...migrationApprovals.filter(requiresMigrationApprovalCleanup),
      ...grantedCleanups,
    ].map((approval) => [migrationApprovalKey(approval), approval]),
  )
  return {
    migrationApprovals,
    migrationApprovalCleanups: [...cleanupByKey.values()],
  }
}

const computeProfilePreflight = async (
  namesToOwnedPermRes: readonly ClassifiedName[],
  signal?: AbortSignal,
): Promise<{
  readonly skipFetchProfilesPhase: boolean
  readonly profileKeys?: readonly V1ProfileKeys[]
}> => {
  signal?.throwIfAborted()
  const namesWithSourceResolver = namesToOwnedPermRes.filter(
    (name) => name.v1ResolverAddress !== null,
  )
  if (namesWithSourceResolver.length === 0) {
    return { skipFetchProfilesPhase: true }
  }

  const keysResult = await getV1ProfileKeys(
    namesWithSourceResolver.map((name) => name.domain.id),
    { signal },
  )
  signal?.throwIfAborted()
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
  signal?: AbortSignal
}): Promise<MigrationPreflight> => {
  const { eoa, hcaAddress, domains, wagmiConfig, publicClient, signal } = params
  signal?.throwIfAborted()

  const { classified } = classifyNames([...domains], eoa)
  const directNames = classified.filter(
    (name): name is DirectClassifiedName => name.action === 'migrate',
  )
  const groups = groupClassifiedNames(classified)

  const needs = approvalNeedsFor(groups)
  const requiresManagerRestoration = classified.some(
    (name) => name.managerAddress !== null,
  )
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
      requiresManagerRestoration,
      wagmiConfig,
      publicClient,
    }),
    computeProfilePreflight(namesToOwnedPermRes, signal),
    resolveDirectMigrationRoutes({ publicClient, classified: directNames }),
    hcaAddress
      ? (async () => {
          await assertRequiredMigrationContractCode({ publicClient })
          if (directNames.length > 0) {
            await assertMigrationHelperRuntimeCode({ publicClient })
          }
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
  signal?.throwIfAborted()

  return {
    ...resolverPreflight,
    ...approvalPreflight,
    ...profilePreflight,
    directMigrationRoutes,
    hcaReadiness,
  }
}
