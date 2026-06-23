/**
 * Pure async function to grant registry-wide (ROOT_RESOURCE) roles on an
 * ENS V2 registry. Mirrors `grantRoles.ts` but skips the name→resource
 * derivation: the resource is hard-coded to ROOT_RESOURCE so the grant
 * applies to the whole registry rather than a single label.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { grantRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

export type GrantRegistryRolesParameters = {
  readonly registryAddress: Address
  readonly account: Address
  readonly roles: Role[]
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface GrantRegistryRolesResult {
  txId: string
  hash: Hex
}

const ROOT_RESOURCE = 0n

export async function grantRegistryRoles(
  params: GrantRegistryRolesParameters,
): Promise<GrantRegistryRolesResult> {
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
    throw new Error('At least one role must be selected')
  }

  const writeParams = grantRolesWriteParameters(
    walletClient as Parameters<typeof grantRolesWriteParameters>[0],
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
      description: `Grant registry roles for ${registryAddress}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)
  return { txId, hash: result.hash }
}
