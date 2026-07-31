/**
 * Detach a v2 name from its resolver (`registry.setResolver(tokenId, 0x0)`).
 *
 * Used during a transfer to hand the recipient a clean name: afterwards the name
 * resolves to nothing, so the sender's stale records are no longer served. This
 * is a *registry* operation authorized by the name owner (the sender still holds
 * the token at this point), NOT a resolver-role write — so it can't revert on
 * permissions. It also never touches the resolver contract itself, which may be
 * shared by the sender's other names.
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
  zeroAddress,
} from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

export interface DetachNameResolverParameters {
  readonly name: string
  readonly label: string
  /** The registry the name's token lives in. */
  readonly registryAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface DetachNameResolverResult {
  readonly txId: string
  readonly hash: Hex
}

export const detachNameResolver = async ({
  name,
  label,
  registryAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: DetachNameResolverParameters): Promise<DetachNameResolverResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = setResolverWriteParameters(walletWithAccount, {
    label,
    registryAddress,
    resolverAddress: zeroAddress,
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
      description: `Detach resolver for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)

  return { txId, hash: result.hash }
}
