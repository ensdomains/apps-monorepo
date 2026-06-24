/**
 * Pure async function to revoke registry-wide (ROOT_RESOURCE) roles on an
 * ENS V2 registry. Mirrors `grantRegistryRoles.ts` but uses
 * `revokeRolesWriteParameters` and `resource` stays hard-coded to
 * ROOT_RESOURCE so the revoke applies registry-wide rather than per-label.
 */

import {
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

export type RevokeRegistryRolesParameters = {
  readonly registryAddress: Address
  readonly account: Address
  readonly roles: Role[]
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface RevokeRegistryRolesResult {
  txId: string
  hash: Hex
}

// See `grantRegistryRoles.ts` — registry-wide scope.
const ROOT_RESOURCE = 0n

export async function revokeRegistryRoles(
  params: RevokeRegistryRolesParameters,
): Promise<RevokeRegistryRolesResult> {
  const {
    registryAddress,
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

  const writeParams = revokeRolesWriteParameters(
    walletClient as Parameters<typeof revokeRolesWriteParameters>[0],
    {
      registryAddress,
      account,
      resource: ROOT_RESOURCE,
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
      description: `Revoke registry roles for ${registryAddress}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)
  return { txId, hash: result.hash }
}
