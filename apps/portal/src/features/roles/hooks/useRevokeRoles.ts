/**
 * React hook wrapper for revokeRoles.
 *
 * Provides a mutation that revokes roles via the transaction manager.
 * Invalidates name roles queries on success with indexer sync polling.
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { revokeRoles } from '../helpers/revokeRoles'

type UseRevokeRolesParameters = {
  name: string
  account: Address
  roles: Role[]
  id: string
}

export function useRevokeRoles() {
  const chainId = namechainSepolia.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (params: UseRevokeRolesParameters) => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }

      return revokeRoles({
        ...params,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
      })
    },
    onSuccess: () => {
      const invalidate = () =>
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'get-name-roles-accounts' ||
            query.queryKey[0] === 'getNameRolesForAccount',
          refetchType: 'all',
        })
      invalidate()
      pollForIndexerSync({ invalidateQueries: () => invalidate() })
    },
  })

  return {
    revokeRoles: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
