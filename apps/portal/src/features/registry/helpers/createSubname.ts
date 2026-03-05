/**
 * Pure async function to create a subname.
 *
 * Prepares the createSubnameV2 transaction, starts it through
 * the transaction manager, and waits for completion.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Address, Hex, WalletClient } from 'viem'
import { prepareCreateSubnameTransaction } from '../utils/create-subname.helpers'

export type CreateSubnameParameters = {
  /** The subregistry address (parent registry for the subname) */
  registryAddress: Address
  /** The label of the subname to create */
  label: string
  /** The owner address of the new subname */
  owner: Address
  /** The resolver address for the new subname */
  resolverAddress: Address
  /** The wallet client with account */
  walletClient: WalletClient
  /** Signer for the transaction */
  signer: Signer
  /** Chain ID */
  chainId: number
  /** Parent name (for description) */
  parentName: string
  /** Transaction ID for tracking */
  id: string
}

export interface CreateSubnameResult {
  txId: string
  hash: Hex
}

export async function createSubname(
  params: CreateSubnameParameters,
): Promise<CreateSubnameResult> {
  const {
    registryAddress,
    label,
    owner,
    resolverAddress,
    walletClient,
    signer,
    chainId,
    parentName,
    id,
  } = params

  const intentResult = await prepareCreateSubnameTransaction({
    registryAddress,
    label,
    owner,
    resolverAddress,
    walletClient,
    chainId,
  })

  if (intentResult.isErr()) {
    throw intentResult.error
  }

  const txId = transactionManager.startTransaction(intentResult.value, signer, {
    id,
    chainId,
    description: `Create subname ${label}.${parentName}`,
  })

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
