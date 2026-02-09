/**
 * React hook wrapper for changeResolver.
 *
 * Same pattern as useSaveRecords: useMutation with mutationFn that adds
 * walletClient, publicClient, signer, chainId and calls the pure helper.
 */

import { useMutation } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'
import { changeResolver } from '../helpers/changeResolver'

interface UseChangeResolverParams {
  readonly name: string
  readonly registryAddress: Address
}

interface ChangeResolverResult {
  txId: string
  hash: Hex
}

/**
 * Hook that provides a mutation for changing the resolver of an ENS name.
 *
 * Uses TanStack Query's useMutation for proper loading/error states.
 *
 * @example
 * ```ts
 * const { changeResolverAsync, isWriting, error } = useChangeResolver({
 *   name: 'myname.eth',
 *   registryAddress,
 * })
 *
 * // When you need to await (e.g. in form submit), use changeResolverAsync
 * await changeResolverAsync(newResolverAddress)
 * ```
 */
export const useChangeResolver = ({
  name,
  registryAddress,
}: UseChangeResolverParams) => {
  const chainId = namechainSepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (
      resolverAddress: Address,
    ): Promise<ChangeResolverResult> => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!walletClient.account) {
        throw new Error('No account connected')
      }

      const signer = createEOASigner(walletClient)

      return changeResolver({
        name,
        registryAddress,
        resolverAddress,
        walletClient,
        publicClient,
        signer,
        chainId,
      })
    },
  })

  return {
    changeResolver: mutation.mutate,
    changeResolverAsync: mutation.mutateAsync,
    txHash: mutation.data?.hash,
    isWriting: mutation.isPending,
    isConfirming: mutation.isPending,
    isConfirmed: mutation.isSuccess,
    isReverted: false, // Transaction manager throws on revert
    error: mutation.error,
    reset: mutation.reset,
    hasWallet: !!walletClient,
  }
}
