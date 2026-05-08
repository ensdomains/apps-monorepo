/**
 * Delete Subname Helpers
 *
 * Pure functions for preparing deleteSubname transactions.
 */

import type {
  CustomTransactionIntent,
  EOATransactionRequest,
} from '@ens-apps/transaction-manager'
import { deleteSubnameWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import { errAsync, fromThrowable, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, WalletClient } from 'viem'
import { encodeFunctionData } from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

const safeEncodeFunctionData = fromThrowable(encodeFunctionData, (e) =>
  e instanceof Error ? e : new Error(String(e)),
)

export interface PrepareDeleteSubnameParams {
  /** The parent registry (subregistry) address that manages this subname */
  readonly registryAddress: Address
  /** The label of the subname to delete (e.g. "sub" for sub.example.eth) */
  readonly label: string
  /** The wallet client with account */
  readonly walletClient: WalletClient
  /** Chain ID */
  readonly chainId: number
}

function assertWalletHasAccount(
  walletClient: WalletClient,
): walletClient is WalletClientWithAccount {
  return walletClient.account !== undefined
}

/**
 * Prepares the deleteSubname transaction request.
 * Returns a CustomTransactionIntent that can be passed to the transaction manager.
 */
export function prepareDeleteSubnameTransaction({
  registryAddress,
  label,
  walletClient,
  chainId,
}: PrepareDeleteSubnameParams): ResultAsync<CustomTransactionIntent, Error> {
  if (!assertWalletHasAccount(walletClient)) {
    return errAsync(new Error('Wallet client has no connected account'))
  }

  const writeParams = deleteSubnameWriteParameters(walletClient, {
    registryAddress,
    label,
  })

  const dataResult = safeEncodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  if (dataResult.isErr()) {
    return errAsync(dataResult.error)
  }

  const request: EOATransactionRequest = {
    type: 'eoa',
    from: walletClient.account.address,
    to: writeParams.address,
    data: dataResult.value,
    chainId,
  }

  const intent: CustomTransactionIntent = {
    type: 'custom',
    request,
  }

  return okAsync(intent)
}
