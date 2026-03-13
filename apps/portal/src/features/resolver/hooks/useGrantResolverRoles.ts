import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address, WalletClient } from 'viem'
import { grantResolverRoles } from '@/features/resolver/helpers/grantResolverRoles'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

interface UseGrantResolverRolesOptions {
  readonly resolverAddress: Address
  readonly walletClient: WalletClient | undefined
  readonly onSuccess?: () => void
}

interface GrantResolverRolesMutationParams {
  readonly account: Address
  readonly roles: ResolverRole[]
}

export const useGrantResolverRoles = ({
  resolverAddress,
  walletClient,
  onSuccess,
}: UseGrantResolverRolesOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ account, roles }: GrantResolverRolesMutationParams) => {
      if (!walletClient) {
        throw new Error('Wallet not connected')
      }
      return grantResolverRoles({
        resolverAddress,
        account,
        roles,
        walletClient,
      })
    },
    onSuccess: async () => {
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            queryKey: ['resolver-overview'],
            refetchType: 'all',
          }),
      })
      onSuccess?.()
    },
  })
}
