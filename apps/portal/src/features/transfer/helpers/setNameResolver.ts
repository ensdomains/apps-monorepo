/**
 * Point a v2 name at a resolver (`registry.setResolver(tokenId, resolver)`).
 * Used after deploying a fresh resolver during a transfer.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setResolverWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

export interface SetNameResolverParameters {
  readonly name: string
  readonly label: string
  /** The registry the name's token lives in. */
  readonly registryAddress: Address
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface SetNameResolverResult {
  readonly txId: string
  readonly hash: Hex
}

export const setNameResolver = async ({
  name,
  label,
  registryAddress,
  resolverAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: SetNameResolverParameters): Promise<SetNameResolverResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = setResolverWriteParameters(walletWithAccount, {
    label,
    registryAddress,
    resolverAddress,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletWithAccount.account.address,
        to: writeParams.address,
        data,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Set resolver for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)

  return { txId, hash: result.hash }
}
