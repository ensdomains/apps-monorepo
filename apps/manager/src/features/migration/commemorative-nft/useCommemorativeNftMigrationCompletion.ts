import { useQuery, useQueryClient } from '@tanstack/react-query'
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

const getCompletionStatus = (
  isError: boolean,
  status?: 'complete' | 'incomplete' | 'reconciling',
) => (isError ? ('error' as const) : (status ?? ('pending' as const)))

export const useCommemorativeNftMigrationCompletion = (params: {
  readonly ownerAddress: Address | undefined
  readonly enabled: boolean
}) => {
  const { ownerAddress, accountAddress } = useSmartAccountContext()
  const chainId = useChainId()
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()
  const journalRevision = useSyncExternalStore(
    subscribeMigrationBatchJournal,
    useCallback(
      () =>
        getMigrationBatchJournalRevision({
          owner: params.ownerAddress ?? zeroAddress,
          hca: accountAddress ?? zeroAddress,
          chainId,
        }),
      [params.ownerAddress, accountAddress, chainId],
    ),
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
    verifiedMigration.data?.revision ?? 0,
  ])
  const activeScope = useRef<string | undefined>(enabled ? scope : undefined)
  const latestScope = useRef<string | undefined>(enabled ? scope : undefined)
  latestScope.current = enabled ? scope : undefined
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
  const hasResolved =
    enabled && query.isFetchedAfterMount && query.data !== undefined
  const evidenceRevision = verifiedMigration.data?.revision ?? 0
  const isCurrent = useCallback(() => {
    if (activeScope.current !== scope || latestScope.current !== scope)
      return false
    if (
      getMigrationBatchJournalRevision({
        owner: params.ownerAddress ?? zeroAddress,
        hca: accountAddress ?? zeroAddress,
        chainId,
      }) !== journalRevision
    )
      return false
    const currentEvidence = queryClient.getQueryData(
      verifiedNftMigrationQueryOptions({
        ownerAddress: params.ownerAddress ?? zeroAddress,
        hcaAddress: accountAddress ?? zeroAddress,
        chainId,
      }).queryKey,
    )
    return (currentEvidence?.revision ?? 0) === evidenceRevision
  }, [
    scope,
    params.ownerAddress,
    accountAddress,
    chainId,
    journalRevision,
    queryClient,
    evidenceRevision,
  ])
  const { refetch } = query
  const recheck = useCallback(async () => {
    if (!isCurrent()) {
      throw new Error('Reconnect your migration account before minting.')
    }
    const result = await refetch({ throwOnError: true })
    if (!isCurrent()) {
      throw new Error('Your migration account changed. Please try again.')
    }
    return result
  }, [refetch, isCurrent])

  return {
    query,
    recheck,
    isCurrent,
    // Preserve an already resolved offer during background reads, but disable
    // mint until that read finishes successfully for this exact owner scope.
    isComplete: hasResolved && query.data.isComplete,
    isFreshComplete:
      hasResolved &&
      query.data.isComplete &&
      query.isSuccess &&
      query.fetchStatus === 'idle',
    status: getCompletionStatus(
      query.isError,
      hasResolved ? query.data.status : undefined,
    ),
  }
}
