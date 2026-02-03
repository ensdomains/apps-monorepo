import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setResolverWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import { useMutation } from '@tanstack/react-query'
import { type Address, encodeFunctionData, type Hex } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainSepolia } from '@/lib/wagmi'

interface UseChangeResolverParams {
  readonly name: string
  readonly registryAddress: Address
}

interface ChangeResolverResult {
  txId: string
  hash: Hex
}

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

      if (!walletClient.account || !walletClient.chain) {
        throw new Error('Wallet client must have account and chain configured')
      }

      // Build write parameters using ensjs
      const writeParams = setResolverWriteParameters(walletClient, {
        name,
        registryAddress,
        resolverAddress,
      })

      // Encode the transaction data
      const data = encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      } as Parameters<typeof encodeFunctionData>[0])

      const signer = createEOASigner(walletClient)

      // Start the transaction through the transaction manager
      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'eoa',
            from: walletClient.account.address,
            to: registryAddress,
            data,
            value: 0n,
            chainId,
          },
        },
        signer,
        {
          description: `Change resolver for ${name}`,
          publicClient,
          chainId,
        },
      )

      // Wait for the transaction to complete
      const result = await waitForTransaction(txId)

      return {
        txId,
        hash: result.hash,
      }
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
  }
}
