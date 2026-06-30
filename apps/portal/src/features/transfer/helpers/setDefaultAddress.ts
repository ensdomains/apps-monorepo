/**
 * Set the name's ETH (coinType 60) address record to the recipient — i.e. make
 * the name's "default address" point at the new owner. This is the forward half
 * of resolution; the recipient can later set it as their primary name (which
 * requires their own signature on their reverse record).
 *
 * Reuses ensjs's `setRecordsWriteParameters`, which handles both the V1 public
 * resolver and the V2 dedicated resolver — same path as the records editor's
 * `saveRecords`.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

// coinType 60 = ETH (ENSIP-11).
const ETH_COIN_TYPE = 60

export interface SetDefaultAddressParameters {
  readonly name: string
  readonly resolverAddress: Address
  readonly recipient: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface SetDefaultAddressResult {
  readonly txId: string
  readonly hash: Hex
}

export const setDefaultAddress = async ({
  name,
  resolverAddress,
  recipient,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: SetDefaultAddressParameters): Promise<SetDefaultAddressResult> => {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const client = walletClient as Parameters<typeof setRecordsWriteParameters>[0]

  const writeParams = await setRecordsWriteParameters(client, {
    name,
    resolverAddress,
    coins: [{ coin: ETH_COIN_TYPE, value: recipient }],
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletClient.account.address,
        to: resolverAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Set default address for ${name}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return { txId, hash: result.hash }
}
