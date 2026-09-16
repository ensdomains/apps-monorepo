import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import { getPublicClient, type Config as WagmiConfig } from '@wagmi/core'
import { ok } from 'neverthrow'
import { type Address, isAddress, type PublicClient, zeroAddress } from 'viem'
import { classifyNames } from '../service/classifyNames'
import { getMigratedNamesCount } from '../service/getMigratedNamesCount'
import {
  loadMigrationRecoverySnapshot,
  loadPendingAtomicMigrationIntents,
  loadSubmittedAtomicMigrationBatches,
  type MigrationBatchJournalScope,
} from '../service/migrationBatchJournal'
import { runEligibilityChecks } from '../service/preflightChecks'
import { getV1NamesForAddress } from '../service/v1SubgraphClient'
import { getCommemorativeNftContractAddress } from './config'
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
}

export type CommemorativeNftMigrationCompletion = {
  readonly isComplete: boolean
  readonly remainingNameCount: number
  readonly migratedNameCount: number
}

const loadRemainingJournalNames = (
  scope: MigrationBatchJournalScope,
): readonly string[] => {
  const recovery = loadMigrationRecoverySnapshot(scope)
  const pending = loadPendingAtomicMigrationIntents(scope)
  const submitted = loadSubmittedAtomicMigrationBatches(scope)

  return [
    ...(recovery?.remainingOperations ?? []),
    ...pending.flatMap((intent) => intent.operations),
    ...submitted.flatMap((batch) => batch.operations),
  ].map(({ name }) => name.toLowerCase())
}

export const fetchCommemorativeNftMigrationCompletion = async (
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
  const [namesResult, migratedResult] = await Promise.all([
    getV1NamesForAddress(params.ownerAddress),
    // A receipt-confirmed and post-state-verified migration proves the upgrade
    // happened before the indexer catches up. It never proves all names are done:
    // the fresh V1, preflight and journal checks below still establish that.
    verifiedMigratedCount > 0
      ? Promise.resolve(ok(verifiedMigratedCount))
      : getMigratedNamesCount(params.ownerAddress),
  ])
  if (namesResult.isErr()) {
    throw new Error('Your remaining ENSv1 names could not be checked.', {
      cause: namesResult.error,
    })
  }
  if (migratedResult.isErr()) {
    throw new Error('Your upgraded names could not be checked.', {
      cause: migratedResult.error,
    })
  }
  const migratedNameCount = migratedResult.value
  if (!Number.isSafeInteger(migratedNameCount) || migratedNameCount < 0) {
    throw new Error('The upgraded name count is invalid.')
  }

  const { classified } = classifyNames(namesResult.value, params.ownerAddress)
  const eligibility = await runEligibilityChecks(
    publicClient as PublicClient,
    classified,
    params.ownerAddress,
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

  return {
    isComplete: remainingNames.size === 0 && migratedNameCount > 0,
    remainingNameCount: remainingNames.size,
    migratedNameCount,
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
      journalRevision: params.journalRevision ?? 0,
      verifiedMigration: params.verifiedMigration,
    }),
    queryFn: () => fetchCommemorativeNftMigrationCompletion(params),
    staleTime: 0,
    refetchOnMount: 'always',
  })
