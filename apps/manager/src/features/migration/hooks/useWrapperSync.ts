import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { invalidateMigrationQueries } from '../pages/MigrationPage.helpers'
import type { ClassifiedName } from '../service/classifyNames'
import { syncMigrationWrappers, WrapperSyncError } from '../service/wrapperSync'

export const useWrapperSync = (names: readonly ClassifiedName[]) => {
  const { walletClient, ownerAddress } = useSmartAccountContext()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!walletClient || !ownerAddress)
        throw new WrapperSyncError({
          reason: 'not-connected',
          message: 'Connect your wallet to sync these names.',
        })
      await syncMigrationWrappers({
        names,
        owner: ownerAddress as Address,
        walletClient,
        publicClient: publicClient as PublicClient,
      })
      await invalidateMigrationQueries(queryClient)
    },
  })
}
