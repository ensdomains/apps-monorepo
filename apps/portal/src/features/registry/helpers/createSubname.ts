/**
 * Pure async function to create a subname.
 *
 * Prepares the createSubname transaction, starts it through
 * the transaction manager, and waits for completion.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Address, Hex, WalletClient } from 'viem'
import {
  type CreateSubnameWrite,
  prepareCreateSubnameTransaction,
} from '../utils/create-subname.helpers'

export type CreateSubnameParameters = {
  /** Where the subname is written, by protocol version */
  readonly write: CreateSubnameWrite
  /** The label of the subname to create */
  readonly label: string
  /** The owner address of the new subname */
  readonly owner: Address
  /** The wallet client with account */
  readonly walletClient: WalletClient
  /** Signer for the transaction */
  readonly signer: Signer
  /** Chain ID */
  readonly chainId: number
  /** Parent name (for description) */
  readonly parentName: string
  /** Transaction ID for tracking */
  readonly id: string
  /** V2 only: expiry timestamp in seconds (unix). Defaults to 1 year via ensjs. */
  readonly expires?: bigint
}

export interface CreateSubnameResult {
  readonly txId: string
  readonly hash: Hex
}

export async function createSubname(
  params: CreateSubnameParameters,
): Promise<CreateSubnameResult> {
  const {
    write,
    label,
    owner,
    walletClient,
    signer,
    chainId,
    parentName,
    id,
    expires,
  } = params

  const intent = prepareCreateSubnameTransaction({
    write,
    parentName,
    label,
    owner,
    walletClient,
    chainId,
    expires,
  })

  const txId = transactionManager.startTransaction(intent, signer, {
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
