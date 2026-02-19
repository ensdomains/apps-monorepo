/**
 * React hook wrapper for grantRoles.
 *
 * Provides a mutation with loading/error states for the UI.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '../../records/helpers/pollForIndexerSync'
import { type GrantRolesParameters, grantRoles } from '../helpers/grantRoles'

type UseGrantRolesParameters = Omit<
  GrantRolesParameters,
  'walletClient' | 'publicClient' | 'signer' | 'chainId'
>

type UseGrantRolesOptions = {
  /** Called after syncing completes (indexer has caught up) */
  onSyncComplete?: () => void
}

export function useGrantRoles(options: UseGrantRolesOptions = {}) {
  const { onSyncComplete } = options
  const chainId = namechainSepolia.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const [isSyncing, setIsSyncing] = useState(false)

  const syncAfterSave = useCallback(async () => {
    setIsSyncing(true)

    try {
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'get-name-roles-accounts',
            refetchType: 'all',
          }),
      })
    } finally {
      setIsSyncing(false)
      onSyncComplete?.()
    }
  }, [queryClient, onSyncComplete])

  const mutation = useMutation({
    mutationFn: async (params: UseGrantRolesParameters) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!walletClient.account) {
        throw new Error('No account connected')
      }

      const signer = createEOASigner(walletClient)

      return grantRoles({
        ...params,
        walletClient,
        publicClient,
        signer,
        chainId,
      })
    },
    onSuccess: () => {
      syncAfterSave()
    },
  })

  return {
    grantRoles: mutation.mutate,
    isWriting: mutation.isPending,
    isSyncing,
    isSuccess: mutation.isSuccess && !isSyncing,
    isError: mutation.isError,
    error: mutation.error,
    txHash: mutation.data?.hash,
    reset: mutation.reset,
    hasWallet: !!walletClient,
  }
}
