import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import type { ResourceId } from '@/lib/resource/resourceId'
import { ensChain } from '@/lib/wagmi'
import { extendSubnameExpiry } from '../helpers/extendSubnameExpiry'
import { refreshSubnameQueries } from '../utils/refreshSubnameQueries'

interface ExtendSubnameExpiryInput {
  /** The full subname */
  readonly subname: string
  readonly resourceId: ResourceId
  readonly expires: bigint
  /** Transaction id for the transaction manager / modal */
  readonly id: string
}

/** Moves an ENSv2 subname's expiry later, then refreshes the parent's subnames. */
export const useExtendSubnameExpiryMutation = ({
  name,
  registryAddress,
}: {
  /** The parent name */
  readonly name: string
  readonly registryAddress: Address
}) => {
  const chainId = ensChain.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      subname,
      resourceId,
      expires,
      id,
    }: ExtendSubnameExpiryInput) => {
      if (!walletClient?.account || !publicClient)
        return Promise.reject(new Error('Wallet not connected'))
      return extendSubnameExpiry({
        name: subname,
        resourceId,
        registryAddress,
        expires,
        id,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
      })
    },
    onSuccess: () => {
      refreshSubnameQueries(queryClient, { name, protocolVersion: 'ENSv2' })
    },
  })
}
