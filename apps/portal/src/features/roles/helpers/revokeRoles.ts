/**
 * Pure async function to remove a user from an ENS V2 registry name.
 *
 * Uses ensjs's revokeRolesWriteParameters to build the transaction,
 * then sends it through the transaction manager.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { getRegistryNameData } from '@ensdomains/ensjs/public/v2'
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
import { namechainEthRegistryAddress } from '@/lib/constants/registry'

// ============================================================================
// Types
// ============================================================================

export type RevokeRolesParameters = {
  readonly name: string
  readonly account: Address
  readonly roles: Role[]
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface RevokeRolesResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Public API
// ============================================================================

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
    id,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (roles.length === 0) {
    throw new Error('No roles found to revoke')
  }

  const { label } = makeLabelNodeAndParent(name)

  const [, entry] = await getRegistryNameData(publicClient, {
    label,
    registryAddress: namechainEthRegistryAddress,
  })

  const resource = labelToCanonicalId(label) | BigInt(entry.eacVersionId)

  const writeParams = revokeRolesWriteParameters(
    walletClient as Parameters<typeof revokeRolesWriteParameters>[0],
    {
      registryAddress: namechainEthRegistryAddress,
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
        to: namechainEthRegistryAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Remove user from ${name} roles`,
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
