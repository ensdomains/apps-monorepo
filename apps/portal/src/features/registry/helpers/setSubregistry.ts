/**
 * Pure async function to set subregistry on the parent registry.
 *
 * Uses transactionManager.startTransaction for Step 2 of the deploy flow
 * (or the only step when using a custom subregistry address).
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setSubregistryWriteParameters } from '@ensdomains/ensjs/wallet'
import type {
  Account,
  Address,
  Chain,
  Hex,
  PublicClient,
  Transport,
  WalletClient,
} from 'viem'
import { encodeFunctionData } from 'viem'

export interface SetSubregistryParameters {
  readonly name: string
  readonly label: string
  readonly parentRegistry: Address
  readonly subregistryAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface SetSubregistryResult {
  readonly txId: string
  readonly hash: Hex
}

type WalletClientWithAccount = WalletClient<Transport, Chain, Account>

export const setSubregistry = async ({
  name,
  label,
  parentRegistry,
  subregistryAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: SetSubregistryParameters): Promise<SetSubregistryResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = setSubregistryWriteParameters(walletWithAccount, {
    registryAddress: parentRegistry,
    label,
    subregistryAddress,
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
        gas: 500000n,
      },
    },
    signer,
    {
      id,
      description: `Set subregistry for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
