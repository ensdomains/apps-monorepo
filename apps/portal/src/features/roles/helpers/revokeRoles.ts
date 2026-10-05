/**
 * Pure async function to remove a user from an ENS V2 registry name.
 *
 * Uses ensjs's revokeRolesWriteParameters to build the transaction,
 * then sends it through the transaction manager.
 */

import {
  type CustomTransactionIntent,
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { revokeRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import {
  assertCalldataResourceId,
  canonicalResourceId,
  type ResourceId,
} from '@/lib/resource/resourceId'

// ============================================================================
// Types
// ============================================================================

export type RevokeRolesTransactionParameters = {
  readonly name: string
  /**
   * The name's on-chain id, resolved by the caller. Not derived here: a label
   * rendered `[<64 hex>]` does not say which name it is, so the id has to come
   * from a typed source (WEB-1458).
   */
  readonly resourceId: ResourceId
  readonly account: Address
  readonly roles: readonly Role[]
  readonly walletClient: WalletClient
  readonly chainId: number
  readonly registryAddress: Address
}

export type RevokeRolesParameters = RevokeRolesTransactionParameters & {
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export interface RevokeRolesResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Public API
// ============================================================================

/**
 * The revoke-roles intent, shared by the gas estimate and {@link revokeRoles}.
 * Requires a walletClient with `account` and `chain` configured.
 */
export function prepareRevokeRolesTransaction({
  name,
  resourceId,
  account,
  roles,
  walletClient,
  chainId,
  registryAddress,
}: RevokeRolesTransactionParameters): CustomTransactionIntent {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const resource = canonicalResourceId(resourceId)

  const writeParams = revokeRolesWriteParameters(
    walletClient as Parameters<typeof revokeRolesWriteParameters>[0],
    {
      registryAddress,
      account,
      resource,
      roles: [...roles],
    },
  )

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  assertCalldataResourceId({
    abi: writeParams.abi,
    data,
    expected: resource,
    action: `Revoking roles for ${name}`,
  })

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: registryAddress,
    data,
    chainId,
  })
}

export async function revokeRoles(
  params: RevokeRolesParameters,
): Promise<RevokeRolesResult> {
  const { name, publicClient, signer, chainId, id } = params

  if (params.roles.length === 0) {
    throw new Error('No roles found to revoke')
  }

  const intent = prepareRevokeRolesTransaction(params)

  const txId = transactionManager.startTransaction(intent, signer, {
    id,
    description: `Remove user from ${name} roles`,
    publicClient,
    chainId,
  })

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
