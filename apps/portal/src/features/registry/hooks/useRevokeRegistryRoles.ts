/**
 * React hook wrapper for revokeRegistryRoles.
 *
 * Symmetric to `useGrantRegistryRoles`. Invalidates `get-registry-roles` on
 * success with indexer-sync polling so RegistryRolesTable refreshes.
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { revokeRegistryRoles } from '../helpers/revokeRegistryRoles'

type UseRevokeRegistryRolesParameters = {
  readonly registryAddress: Address
  readonly account: Address
  readonly roles: Role[]
  readonly id: string
}

const REGISTRY_ROLES_QUERY_KEY = 'get-registry-roles'

export function useRevokeRegistryRoles() {
  const chainId = sepoliaWithEns.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const invalidateRegistryRoles = () =>
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === REGISTRY_ROLES_QUERY_KEY,
      refetchType: 'all',
    })

  const mutation = useMutation({
    mutationFn: async (params: UseRevokeRegistryRolesParameters) => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }
      return revokeRegistryRoles({
        ...params,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
      })
    },
    onSuccess: () => {
      invalidateRegistryRoles()
      pollForIndexerSync({ invalidateQueries: invalidateRegistryRoles })
    },
  })

  return {
    revokeRegistryRoles: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  }
}
