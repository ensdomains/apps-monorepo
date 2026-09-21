import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import { getPublicClient, type Config as WagmiConfig } from '@wagmi/core'
import { type Address, isAddress, type PublicClient, zeroAddress } from 'viem'
import { config } from '@/config'
import { abortablePublicClient } from '../service/abortablePublicClient'
import { classifyNames } from '../service/classifyNames'
import { getMigratedNamesCount } from '../service/getMigratedNamesCount'
import {
  loadMigrationBatchJournal,
  type MigrationBatchJournalScope,
} from '../service/migrationBatchJournal'
import {
  getMigrationCompletionDeploymentIdentity,
  restoreMigrationCompletionCheckpoint,
} from '../service/migrationCompletionCheckpoint'
import { runEligibilityChecks } from '../service/preflightChecks'
import { withRequestDeadline } from '../service/requestDeadline'
import { getV1NamesForAddress } from '../service/v1SubgraphClient'
import { getCommemorativeNftContractAddress } from './config'
import { trackNftEvent } from './diagnostics'
import {
  getVerifiedNftMigrationCount,
  type VerifiedNftMigration,
} from './verifiedMigration'

export type CommemorativeNftMigrationCompletionParams = {
  readonly ownerAddress: Address
  readonly hcaAddress: Address
  readonly chainId: number
  readonly wagmiConfig: WagmiConfig
  readonly verifiedMigration?: VerifiedNftMigration
  readonly signal?: AbortSignal
}

type CommemorativeNftMigrationCompletion = {
  readonly status: 'complete' | 'incomplete' | 'reconciling'
  readonly isComplete: boolean
  readonly remainingNameCount: number
  readonly migratedNameCount: number
}

const loadRemainingJournalNames = (
  scope: MigrationBatchJournalScope,
): readonly string[] => {
  const { recovery, pending, submitted } = loadMigrationBatchJournal(scope)

  return [
    ...(recovery?.remainingOperations ?? []),
    ...pending.flatMap((intent) => intent.operations),
    ...submitted.flatMap((batch) => batch.operations),
  ].map(({ name }) => name.toLowerCase())
}

const getPositiveMigrationEvidence = async (
  params: CommemorativeNftMigrationCompletionParams,
  publicClient: PublicClient,
  scope: MigrationBatchJournalScope,
  verifiedCount: number,
): Promise<number> => {
  if (verifiedCount > 0) return verifiedCount
  const migrated = await withRequestDeadline(
    async () => getMigratedNamesCount(params.ownerAddress),
    { signal: params.signal },
  )
  if (migrated.isErr())
    throw new Error('Your upgraded names could not be checked.', {
      cause: migrated.error,
    })
  if (!Number.isSafeInteger(migrated.value) || migrated.value < 0)
    throw new Error('The upgraded name count is invalid.')
  if (migrated.value > 0) return migrated.value
  const restored = await restoreMigrationCompletionCheckpoint({
    scope,
    publicClient,
    signal: params.signal,
  })
  return restored ? 1 : 0
}

const checkMigrationCompletion = async (
  params: CommemorativeNftMigrationCompletionParams,
): Promise<CommemorativeNftMigrationCompletion> => {
  if (
    !isAddress(params.ownerAddress) ||
    !isAddress(params.hcaAddress) ||
    params.ownerAddress.toLowerCase() === zeroAddress ||
    params.hcaAddress.toLowerCase() === zeroAddress
  ) {
    throw new Error('The migration account could not be checked.')
  }
  if (!getCommemorativeNftContractAddress(params.chainId)) {
    throw new Error('Migration completion is unavailable on this network.')
  }
  const publicClient = getPublicClient(params.wagmiConfig, {
    chainId: params.chainId,
  })
  if (!publicClient || publicClient.chain?.id !== params.chainId) {
    throw new Error('The migration network could not be checked.')
  }

  const scope = {
    chainId: params.chainId,
    owner: params.ownerAddress,
    hca: params.hcaAddress,
  }
  const remainingNames = new Set(loadRemainingJournalNames(scope))
  const verifiedMigratedCount = getVerifiedNftMigrationCount(
    params.verifiedMigration,
    params,
  )
  // Read through the services directly: the dashboard's cached name counts
  // and eligibility lists do not certify completion for a new mint.
  const [namesResult, migratedNameCount] = await Promise.all([
    getV1NamesForAddress(params.ownerAddress, { signal: params.signal }),
    getPositiveMigrationEvidence(
      params,
      publicClient as PublicClient,
      scope,
      verifiedMigratedCount,
    ),
  ])
  if (namesResult.isErr()) {
    throw new Error('Your remaining ENSv1 names could not be checked.', {
      cause: namesResult.error,
    })
  }
  const { classified } = classifyNames(
    namesResult.value,
    params.ownerAddress,
    config.chain.id,
  )
  params.signal?.throwIfAborted()
  const eligibility = await withRequestDeadline(
    (signal) =>
      runEligibilityChecks(
        abortablePublicClient(publicClient as PublicClient, signal),
        classified,
        params.ownerAddress,
      ),
    { signal: params.signal },
  )
  if (eligibility.failed.length > 0) {
    throw new Error('Some ENSv1 names could not be checked. Please try again.')
  }
  for (const name of eligibility.eligible) {
    remainingNames.add(name.domain.name.toLowerCase())
  }
  // An in-flight migration can add recovery work while the network reads run.
  // Work seen at either boundary blocks this result until a fresh check.
  for (const name of loadRemainingJournalNames(scope)) remainingNames.add(name)

  params.signal?.throwIfAborted()
  const status =
    remainingNames.size > 0
      ? 'incomplete'
      : migratedNameCount > 0
        ? 'complete'
        : 'reconciling'
  return {
    status,
    isComplete: status === 'complete',
    remainingNameCount: remainingNames.size,
    migratedNameCount,
  }
}

export const fetchCommemorativeNftMigrationCompletion = async (
  params: CommemorativeNftMigrationCompletionParams,
): Promise<CommemorativeNftMigrationCompletion> => {
  const startedAt = Date.now()
  try {
    const result = await withRequestDeadline(
      (signal) => checkMigrationCompletion({ ...params, signal }),
      { signal: params.signal, timeoutMs: 30_000 },
    )
    trackNftEvent('nft:completion_check', {
      outcome: result.status,
      duration_ms: Date.now() - startedAt,
      remaining_count: result.remainingNameCount,
    })
    return result
  } catch (error) {
    trackNftEvent('nft:completion_check', {
      outcome: params.signal?.aborted ? 'aborted' : 'error',
      duration_ms: Date.now() - startedAt,
    })
    throw error
  }
}

export const commemorativeNftMigrationCompletionQueryOptions = (
  params: CommemorativeNftMigrationCompletionParams & {
    readonly journalRevision?: number
  },
) =>
  queryOptions({
    queryKey: qk('migration', 'nft_completion', {
      ownerAddress: params.ownerAddress.toLowerCase(),
      hcaAddress: params.hcaAddress.toLowerCase(),
      chainId: params.chainId,
      contractAddress: getCommemorativeNftContractAddress(params.chainId),
      deployment: getMigrationCompletionDeploymentIdentity(params.chainId),
      journalRevision: params.journalRevision ?? 0,
      evidenceRevision: params.verifiedMigration?.revision ?? 0,
    }),
    queryFn: ({ signal }) =>
      fetchCommemorativeNftMigrationCompletion({ ...params, signal }),
    retry: false,
    refetchInterval: (query) =>
      query.state.status === 'success' &&
      query.state.data?.status === 'reconciling' &&
      query.state.dataUpdateCount < 6
        ? 2_000
        : false,
    staleTime: 0,
    refetchOnMount: 'always',
  })
