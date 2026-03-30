/**
 * Pure async function to set reverse resolution (address → name) via transactionManager.
 *
 * Handles both L1 (setPrimaryName) and L2 (setName/setNameForAddr) flows.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Hex, PublicClient, WalletClient } from 'viem'
import { encodeFunctionData } from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

interface WriteRequest {
  readonly address: `0x${string}`
  readonly abi: readonly unknown[]
  readonly functionName: string
  readonly args: readonly unknown[]
}

export interface SetReverseResolutionParameters {
  readonly name: string
  readonly request: WriteRequest
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface SetReverseResolutionResult {
  readonly txId: string
  readonly hash: Hex
}

export const setReverseResolution = async ({
  name,
  request,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: SetReverseResolutionParameters): Promise<SetReverseResolutionResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const data = encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletWithAccount.account.address,
        to: request.address,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Set reverse resolution to ${name}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
