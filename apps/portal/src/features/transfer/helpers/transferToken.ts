/**
 * Transfer ownership of a v2 name.
 *
 * In ENS v2 a name is an ERC-1155 token held in its leaf `PermissionedRegistry`
 * (`getState(tokenId).latestOwner` is the owner). There is no dedicated
 * "transfer name" contract call — ownership moves via the standard ERC-1155
 * `safeTransferFrom`. The token id is the *versioned* id from `getTokenId(label)`.
 *
 * Note: the registry gates transfers on a transfer role/observer, so the sender
 * must hold the token and be allowed to move it.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { transferNameWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

export interface TransferTokenParameters {
  readonly name: string
  /** The registry the name's token lives in (the leaf subregistry). */
  readonly registryAddress: Address
  readonly tokenId: bigint
  readonly recipient: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface TransferTokenResult {
  readonly txId: string
  readonly hash: Hex
}

export const transferToken = async ({
  name,
  registryAddress,
  tokenId,
  recipient,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: TransferTokenParameters): Promise<TransferTokenResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = transferNameWriteParameters(walletWithAccount, {
    registryAddress,
    tokenId,
    newOwnerAddress: recipient,
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
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Transfer ${name}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return { txId, hash: result.hash }
}
