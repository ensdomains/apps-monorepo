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
import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { labelToCanonicalId, type Role } from '@ensdomains/ensjs/utils/v2'
import { revokeRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'

// ============================================================================
// Types
// ============================================================================

export type RevokeRolesTransactionParameters = {
  readonly name: string
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
 * The encoded revoke-roles call — deterministic given the name, account and
 * roles, so it can be computed at modal-open time to drive the pre-start gas
 * estimate. Requires a walletClient with `account` and `chain` configured.
 */
export function prepareRevokeRolesTransaction(
  params: RevokeRolesTransactionParameters,
): CustomTransactionIntent {
  const { name, account, roles, walletClient, chainId, registryAddress } =
    params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const { label } = makeLabelNodeAndParent(name)
  const resource = labelToCanonicalId(label)

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
  const {
    name,
    account,
    roles,
    walletClient,
    publicClient,
    signer,
    chainId,
    registryAddress,
    id,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (roles.length === 0) {
    throw new Error('No roles found to revoke')
  }

  const intent = prepareRevokeRolesTransaction({
    name,
    account,
    roles,
    walletClient,
    chainId,
    registryAddress,
  })

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
