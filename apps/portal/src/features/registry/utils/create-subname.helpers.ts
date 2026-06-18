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
import type { Address, WalletClient } from 'viem'
import { encodeFunctionData, zeroAddress } from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'

const safeEncodeFunctionData = fromThrowable(encodeFunctionData, (e) =>
  e instanceof Error ? e : new Error(String(e)),
)

/**
 * Default role bitmap granted to the subname owner on creation.
 *
 * Each role occupies one nibble in the EnhancedAccessControl bitmap, so a value
 * of all `1`s grants every role to the owner. This ensures freshly created
 * subnames have all roles enabled by default, rather than being created with no
 * roles attached (an empty `0n` bitmap).
 *
 * ensjs uses the same `0x1111…` value internally for `deploySubregistry` and
 * `deployVerifiableProxy`, but keeps it as a module-private const (it is not
 * exported from `@ensdomains/ensjs`), so we redeclare the literal here.
 */
export const DEFAULT_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
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
  /** Optional: role bitmap to grant to the owner (defaults to all roles) */
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
  roleBitmap = DEFAULT_ROLE_BITMAP,
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
