import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import type { PublicClient } from 'viem'
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
        publicClient: publicClient as PublicClient,
        onProgress: setProgress,
      })
    },
  })

  const mutationResetRef = useRef(mutation.reset)
  mutationResetRef.current = mutation.reset

  const reset = useCallback(() => {
    setProgress(null)
    mutationResetRef.current()
  }, [])

  return {
    migrate: mutation.mutate,
    migrateAsync: mutation.mutateAsync,
    progress,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    data: mutation.data,
    reset,
  }
}
