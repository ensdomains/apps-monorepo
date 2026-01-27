import { setResolverWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import type { Address, WriteContractParameters } from 'viem'
import {
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'
import { namechainSepolia } from '@/lib/wagmi'

interface UseChangeResolverParams {
  readonly name: string
  readonly registryAddress: Address
}

export const useChangeResolver = ({
  name,
  registryAddress,
}: UseChangeResolverParams) => {
  const { data: walletClient } = useWalletClient({
    chainId: namechainSepolia.id,
  })

  const {
    writeContractAsync,
    data: txHash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract()

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isReceiptReceived,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Derived states
  const isConfirmed = isReceiptReceived && receipt?.status === 'success'
  const isReverted = isReceiptReceived && receipt?.status === 'reverted'

  const changeResolver = async (resolverAddress: Address) => {
    if (!walletClient) {
      throw new Error('Wallet client not available')
    }

    const writeParams = setResolverWriteParameters(walletClient, {
      name,
      registryAddress,
      resolverAddress,
    })

    return writeContractAsync(writeParams as WriteContractParameters)
  }

  return {
    changeResolver,
    txHash,
    isWriting,
    isConfirming,
    isConfirmed,
    isReverted,
    writeError: writeError ?? null,
    receiptError: receiptError ?? null,
    hasWallet: !!walletClient,
  }
}
