import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { grantResolverRoles } from '@/features/resolver/helpers/grantResolverRoles'
import type { ResolverRolesSaveAction } from '@/features/resolver/helpers/prepareResolverRolesIntent'
import { revokeResolverRoles } from '@/features/resolver/helpers/revokeResolverRoles'
import {
  type ResolverRevocation,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

export type RevokeResolverGrantParams = {
  readonly account: Address
  readonly revocation: ResolverRevocation
  /** The modal step this revoke belongs to. */
  readonly id: string
}

/**
 * The resolver roles sidebar's two writes: saving one row's edits, and one
 * revoke step of "Remove user". Both refresh the resolver overview once the
 * indexer has caught up.
 */
export const useResolverRolesMutations = (resolverAddress: Address) => {
  const chainId = sepoliaWithEns.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const getWriteClients = () => {
    if (!walletClient?.account || !publicClient) {
      throw new Error('Wallet not connected')
    }
    return {
      walletClient,
      publicClient,
      signer: createEOASigner(walletClient),
      chainId,
    }
  }

  const syncOverview = () =>
    pollForIndexerSync({
      invalidateQueries: () =>
        queryClient.invalidateQueries({
          queryKey: ['resolver-overview'],
          refetchType: 'all',
        }),
    })

  const saveMutation = useMutation({
    mutationFn: async ({
      resource,
      account,
      rolesToGrant,
      rolesToRevoke,
      id,
    }: ResolverRolesSaveAction & { readonly id: string }) => {
      const clients = getWriteClients()

      if (rolesToGrant.length > 0) {
        if (resource !== ROOT_RESOURCE) {
          throw new Error(
            'Argument-scoped roles are granted from the Add user form',
          )
        }
        await grantResolverRoles({
          ...clients,
          resolverAddress,
          account,
          scope: { type: 'root', roles: rolesToGrant },
          id,
        })
      }

      if (rolesToRevoke.length > 0) {
        await revokeResolverRoles({
          ...clients,
          resolverAddress,
          resource,
          account,
          roles: rolesToRevoke,
          id,
        })
      }
    },
    onSuccess: syncOverview,
  })

  const removeUserMutation = useMutation({
    mutationFn: async ({
      account,
      revocation,
      id,
    }: RevokeResolverGrantParams) =>
      revokeResolverRoles({
        ...getWriteClients(),
        resolverAddress,
        resource: revocation.resource,
        account,
        roles: revocation.roles,
        id,
      }),
    onSuccess: syncOverview,
  })

  return {
    saveMutation,
    removeUserMutation,
    isWalletConnected: Boolean(walletClient?.account),
    connectedAddress: walletClient?.account?.address,
  }
}
