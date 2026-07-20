/**
 * Create Subname Helpers
 *
 * Pure functions for preparing createSubname transactions.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { createSubnameV2WriteParameters } from '@ensdomains/ensjs/wallet'
import { err, fromThrowable, ok, type Result } from 'neverthrow'
import type { Address, WalletClient } from 'viem'
import { encodeFunctionData, zeroAddress } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
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
 * Prepares the createSubnameV2 transaction — deterministic given the params, so
 * the same intent drives the pre-start gas estimate and the actual submit
 * (shared by {@link createSubname}), keeping the estimated call byte-identical
 * to the one submitted.
 *
 * NOTE: `createSubnameV2WriteParameters` defaults a missing `expires` to
 * `Date.now() + 1 year` at encode time, so callers that want the pre-start gas
 * estimate to stay byte-identical to the submitted call MUST pass a concrete,
 * frozen `expires` (rather than relying on the default), and pass that same
 * value into the actual `createSubname` call.
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
}: PrepareCreateSubnameParams): Result<CustomTransactionIntent, Error> {
  if (!assertWalletHasAccount(walletClient)) {
    return err(new Error('Wallet client has no connected account'))
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
    return err(dataResult.error)
  }

  return ok(
    toEoaCustomIntent({
      from: walletClient.account.address,
      to: writeParams.address,
      data: dataResult.value,
      chainId,
    }),
  )
}
