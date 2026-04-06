/**
 * Pure async function to set forward resolution (name → address) via transactionManager.
 *
 * This makes a name the "primary name" by establishing the forward match
 * (setting the ETH address record on the resolver to point back to the address).
 */

import type { SetForwardResolutionRequest } from '@ens-apps/l2-primary/utils'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Hex, PublicClient, WalletClient } from 'viem'
import { encodeFunctionData } from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

export interface SetForwardResolutionParameters {
  readonly name: string
  readonly request: SetForwardResolutionRequest
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface SetForwardResolutionResult {
  readonly txId: string
  readonly hash: Hex
}

export const setForwardResolution = async ({
  name,
  request,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: SetForwardResolutionParameters): Promise<SetForwardResolutionResult> => {
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
      description: `Set primary name for ${name}`,
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
