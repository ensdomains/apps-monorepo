import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  queryOptions,
  skipToken,
} from '@tanstack/react-query'
import { type Address, isAddress, zeroAddress } from 'viem'
import type { MigrationJournalOperation } from '../service/migrationBatchJournal'
import { getMigrationCompletionDeploymentIdentity } from '../service/migrationCompletionCheckpoint'
import { getCommemorativeNftContractAddress } from './config'

type VerifiedNftMigrationScope = {
  readonly ownerAddress: Address
  readonly hcaAddress: Address
  readonly chainId: number
}

export type VerifiedNftMigration = VerifiedNftMigrationScope & {
  readonly revision?: number
  readonly completedOperations: readonly MigrationJournalOperation[]
}

const isValidScope = (scope: VerifiedNftMigrationScope): boolean =>
  Number.isSafeInteger(scope.chainId) &&
  scope.chainId > 0 &&
  [scope.ownerAddress, scope.hcaAddress].every(
    (address) =>
      typeof address === 'string' &&
      isAddress(address) &&
      address.toLowerCase() !== zeroAddress,
  )

const getValidOperations = (
  operations: readonly MigrationJournalOperation[],
): readonly MigrationJournalOperation[] | undefined => {
  if (!Array.isArray(operations) || operations.length === 0) return undefined
  // Copy and deduplicate into a new map; caller-owned evidence stays untouched.
  const unique = new Map<string, MigrationJournalOperation>()
  for (const operation of operations) {
    if (
      !operation ||
      typeof operation.name !== 'string' ||
      operation.name.trim().length === 0 ||
      operation.name !== operation.name.trim() ||
      (operation.action !== 'migrate' && operation.action !== 'copy')
    ) {
      return undefined
    }
    const name = operation.name.toLowerCase()
    const previous = unique.get(name)
    if (previous && previous.action !== operation.action) return undefined
    unique.set(name, Object.freeze({ name, action: operation.action }))
  }
  return Object.freeze([...unique.values()])
}

export const getVerifiedNftMigrationCount = (
  evidence: VerifiedNftMigration | undefined,
  scope: VerifiedNftMigrationScope,
): number => {
  if (
    !evidence ||
    !isValidScope(scope) ||
    !isValidScope(evidence) ||
    evidence.chainId !== scope.chainId ||
    evidence.ownerAddress.toLowerCase() !== scope.ownerAddress.toLowerCase() ||
    evidence.hcaAddress.toLowerCase() !== scope.hcaAddress.toLowerCase()
  ) {
    return 0
  }
  return getValidOperations(evidence.completedOperations)?.length ?? 0
}

export const verifiedNftMigrationQueryOptions = (
  scope: VerifiedNftMigrationScope,
) =>
  queryOptions<VerifiedNftMigration>({
    queryKey: qk('migration', 'verified_nft_migration', {
      ownerAddress: scope.ownerAddress.toLowerCase(),
      hcaAddress: scope.hcaAddress.toLowerCase(),
      chainId: scope.chainId,
      contractAddress: getCommemorativeNftContractAddress(scope.chainId),
      deployment: getMigrationCompletionDeploymentIdentity(scope.chainId),
    }),
    queryFn: skipToken,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    structuralSharing: false,
  })

/** Record only completed operations from the successful, verified migration run. */
export const recordVerifiedNftMigration = (params: {
  readonly queryClient: QueryClient
  readonly evidence: VerifiedNftMigration
}): void => {
  const { queryClient, evidence } = params
  if (getVerifiedNftMigrationCount(evidence, evidence) === 0) {
    throw new Error('Verified migration evidence is invalid or empty.')
  }

  const { queryKey, ...defaults } = verifiedNftMigrationQueryOptions(evidence)
  // Evidence must survive a dashboard navigation even if no observer has
  // mounted yet. This cache is memory-only and ends with the QueryClient.
  queryClient.setQueryDefaults(queryKey, defaults)
  queryClient.setQueryData(queryKey, (previous) => {
    const previousOperations =
      getVerifiedNftMigrationCount(previous, evidence) > 0
        ? (previous?.completedOperations ?? [])
        : []
    const completedOperations = getValidOperations([
      ...previousOperations,
      ...evidence.completedOperations,
    ])
    if (!completedOperations) {
      throw new Error('Verified migration operations conflict.')
    }
    return Object.freeze({
      ownerAddress: evidence.ownerAddress.toLowerCase() as Address,
      hcaAddress: evidence.hcaAddress.toLowerCase() as Address,
      chainId: evidence.chainId,
      revision: (previous?.revision ?? 0) + 1,
      completedOperations,
    })
  })
}
