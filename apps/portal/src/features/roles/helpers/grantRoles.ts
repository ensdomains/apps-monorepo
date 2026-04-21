/**
 * Pure async function to grant roles on an ENS V2 registry name.
 *
 * Uses ensjs's grantRolesWriteParameters to build the transaction,
 * then sends it through the transaction manager.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { labelToCanonicalId, type Role } from '@ensdomains/ensjs/utils/v2'
import { grantRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

// ============================================================================
// Types
// ============================================================================

export type GrantRolesParameters = {
  readonly name: string
  readonly account: Address
  readonly roles: Role[]
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly registryAddress: Address
  readonly id: string
}

export interface GrantRolesResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Public API
// ============================================================================

export async function grantRoles(
  params: GrantRolesParameters,
): Promise<GrantRolesResult> {
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
    throw new Error('At least one role must be selected')
  }

  const { label } = makeLabelNodeAndParent(name)
  const resource = labelToCanonicalId(label)

  const writeParams = grantRolesWriteParameters(
    walletClient as Parameters<typeof grantRolesWriteParameters>[0],
    {
      registryAddress,
      account,
      resource,
      roles,
    },
  )

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
        to: registryAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Grant roles for ${name}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
