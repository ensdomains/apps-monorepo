/**
 * Pure async function to change the resolver for an ENS V2 name.
 *
 * Follows the same pattern as saveRecords and deploySubregistry/setSubregistry:
 * 1. Get tokenId from registry (getRegistryNameData)
 * 2. Encode setResolver call with ensjs ABI snippet
 * 3. Submit via transaction manager
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs/contracts'
import { getRegistryNameData } from '@ensdomains/ensjs/public/v2'
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

export interface ChangeResolverParameters {
  /** The ENS name (e.g., 'sub.parent.eth') */
  readonly name: string
  /** The registry address that manages this name (parent's registry) */
  readonly registryAddress: Address
  /** The new resolver address to set */
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface ChangeResolverResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Change the resolver for an ENS V2 name.
 *
 * @throws Error if wallet not connected, name not found, or transaction fails
 *
 * @example
 * ```ts
 * const result = await changeResolver({
 *   name: 'myname.eth',
 *   registryAddress: parentRegistry,
 *   resolverAddress: newResolverAddress,
 *   walletClient,
 *   publicClient,
 *   signer,
 *   chainId: 11155111,
 * })
 * ```
 */
export const changeResolver = async ({
  name,
  registryAddress,
  resolverAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: ChangeResolverParameters): Promise<ChangeResolverResult> => {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const label = name.split('.')[0]

  const [tokenId] = await getRegistryNameData(publicClient, {
    registryAddress,
    label,
  })

  if (tokenId === 0n) {
    throw new Error(`Name "${name}" not found in registry`)
  }

  const data = encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [tokenId, resolverAddress],
  })

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
      description: `Change resolver for ${name}`,
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
