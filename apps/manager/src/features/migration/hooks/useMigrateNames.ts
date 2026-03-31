import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useConfig } from 'wagmi'
import { V2_CONTRACTS } from '@/features/migration/contracts/addresses'
import {
  executeMigration,
  type MigrationProgress,
  type MigrationResult,
} from '@/features/migration/service/migrationService'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'

/**
 * Hook to execute ENS v1 → v2 migration for selected names.
 *
 * Uses the connected EOA wallet to call safeTransferFrom on BaseRegistrar (unwrapped)
 * or NameWrapper (wrapped) contracts, transferring tokens to the appropriate migration
 * controller which registers them in ENS v2.
 *
 * Returns mutation controls and real-time progress for the migration UI.
 */
export function useMigrateNames() {
  const wagmiConfig = useConfig()
  const { ownerAddress } = useSmartAccountContext()
  const [progress, setProgress] = useState<MigrationProgress | null>(null)

  const mutation = useMutation<MigrationResult, Error, V1Domain[]>({
    mutationKey: $qk({
      $scope: 'migration',
      $action: 'migrate',
      owner: ownerAddress,
    }),
    mutationFn: async (domains: V1Domain[]) => {
      if (!ownerAddress) {
        throw new Error('Wallet not connected')
      }

      return executeMigration({
        domains,
        migrationOwner: ownerAddress,
        defaultResolver: V2_CONTRACTS.ENSV2Resolver,
        wagmiConfig,
        publicClient,
        onProgress: setProgress,
      })
    },
    onSettled: () => {
      // Keep final progress state visible (don't reset)
    },
  })

  const reset = useCallback(() => {
    setProgress(null)
    mutation.reset()
  }, [mutation])

  return {
    /** Trigger migration for the given domains */
    migrate: mutation.mutate,
    migrateAsync: mutation.mutateAsync,
    /** Real-time progress of the migration */
    progress,
    /** Whether the mutation is currently executing */
    isPending: mutation.isPending,
    /** Whether the mutation encountered an error */
    isError: mutation.isError,
    /** The error if the mutation failed */
    error: mutation.error,
    /** Whether the migration completed successfully */
    isSuccess: mutation.isSuccess,
    /** The result data on success */
    data: mutation.data,
    /** Reset the mutation and progress state */
    reset,
  }
}
