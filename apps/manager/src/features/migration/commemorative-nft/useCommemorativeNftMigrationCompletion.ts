import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  getMigrationBatchJournalRevision,
  getServerMigrationBatchJournalRevision,
  subscribeMigrationBatchJournal,
} from '../service/migrationBatchJournal'
import { commemorativeNftMigrationCompletionQueryOptions } from './migrationCompletion'
import { verifiedNftMigrationQueryOptions } from './verifiedMigration'

export const useCommemorativeNftMigrationCompletion = (params: {
  readonly ownerAddress: Address | undefined
  readonly enabled: boolean
}) => {
  const { ownerAddress, accountAddress } = useSmartAccountContext()
  const chainId = useChainId()
  const wagmiConfig = useConfig()
  const journalRevision = useSyncExternalStore(
    subscribeMigrationBatchJournal,
    getMigrationBatchJournalRevision,
    getServerMigrationBatchJournalRevision,
  )
  const verifiedMigration = useQuery(
    verifiedNftMigrationQueryOptions({
      ownerAddress: params.ownerAddress ?? zeroAddress,
      hcaAddress: accountAddress ?? zeroAddress,
      chainId,
    }),
  )
  const enabled =
    params.enabled &&
    !!params.ownerAddress &&
    params.ownerAddress.toLowerCase() === ownerAddress?.toLowerCase() &&
    !!accountAddress
  const scope = JSON.stringify([
    params.ownerAddress?.toLowerCase(),
    accountAddress?.toLowerCase(),
    chainId,
    journalRevision,
    verifiedMigration.data,
  ])
  const activeScope = useRef<string | undefined>(enabled ? scope : undefined)
  useEffect(() => {
    activeScope.current = enabled ? scope : undefined
    return () => {
      activeScope.current = undefined
    }
  }, [enabled, scope])
  const query = useQuery({
    ...commemorativeNftMigrationCompletionQueryOptions({
      ownerAddress: params.ownerAddress ?? zeroAddress,
      hcaAddress: accountAddress ?? zeroAddress,
      chainId,
      wagmiConfig,
      journalRevision,
      verifiedMigration: verifiedMigration.data,
    }),
    enabled,
  })
  const hasResolved = enabled && query.isFetchedAfterMount && query.isSuccess
  const { refetch } = query
  const recheck = useCallback(async () => {
    if (activeScope.current !== scope) {
      throw new Error('Reconnect your migration account before minting.')
    }
    const result = await refetch({ throwOnError: true })
    if (activeScope.current !== scope) {
      throw new Error('Your migration account changed. Please try again.')
    }
    return result
  }, [refetch, scope])

  return {
    query,
    recheck,
    // Preserve an already resolved offer during background reads, but disable
    // mint until that read finishes successfully for this exact owner scope.
    isComplete: hasResolved && query.data.isComplete,
    isFreshComplete:
      hasResolved && query.data.isComplete && query.fetchStatus === 'idle',
    status: query.isError
      ? ('error' as const)
      : hasResolved
        ? query.data.isComplete
          ? ('complete' as const)
          : ('incomplete' as const)
        : ('pending' as const),
  }
}
