/**
 * Create Subname Helpers
 *
 * Pure functions for preparing createSubname transactions.
 */

import type {
  CustomTransactionIntent,
  EOATransactionRequest,
} from '@ens-apps/transaction-manager'
import { createSubnameV2WriteParameters } from '@ensdomains/ensjs/wallet'
import { errAsync, fromThrowable, okAsync, type ResultAsync } from 'neverthrow'
import type { Account, Address, Chain, Transport, WalletClient } from 'viem'
import { encodeFunctionData, zeroAddress } from 'viem'

type WalletClientWithAccount = WalletClient<Transport, Chain, Account>

const safeEncodeFunctionData = fromThrowable(encodeFunctionData, (e) =>
  e instanceof Error ? e : new Error(String(e)),
)

export interface PrepareCreateSubnameParams {
  /** The subregistry address (parent registry for the subname) */
  readonly registryAddress: Address
  /** The label of the subname to create */
  readonly label: string
  /** The owner address of the new subname */
  readonly owner: Address
  /** The resolver address for the new subname */
  readonly resolverAddress: Address
  /** The wallet client with account */
  readonly walletClient: WalletClient
  /** Chain ID */
  readonly chainId: number
  /** Optional: subregistry address for the new subname (defaults to zeroAddress) */
  readonly subregistryAddress?: Address
  /** Optional: role bitmap to grant to the owner (defaults to 0n) */
  readonly roleBitmap?: bigint
  /** Optional: expiration timestamp in seconds */
  readonly expires?: bigint
}

function assertWalletHasAccount(
  walletClient: WalletClient,
): walletClient is WalletClientWithAccount {
  return walletClient.account !== undefined
}

/**
 * Prepares the createSubnameV2 transaction request.
 * Returns a CustomTransactionIntent that can be passed to the transaction manager.
 */
export function prepareCreateSubnameTransaction({
  registryAddress,
  label,
  owner,
  resolverAddress,
  walletClient,
  chainId,
  subregistryAddress = zeroAddress,
  roleBitmap = 0n,
  expires,
}: PrepareCreateSubnameParams): ResultAsync<CustomTransactionIntent, Error> {
  if (!assertWalletHasAccount(walletClient)) {
    return errAsync(new Error('Wallet client has no connected account'))
  }

  const writeParams = createSubnameV2WriteParameters(walletClient, {
    registryAddress,
    label,
    owner,
    subregistryAddress,
    resolverAddress,
    roleBitmap,
    expires,
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
