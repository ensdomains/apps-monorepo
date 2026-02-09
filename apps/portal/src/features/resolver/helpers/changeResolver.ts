/**
 * Pure async function to change the resolver for an ENS V2 name.
 *
 * Follows the pattern from transaction-manager's resolver.actors.ts:
 * 1. Get tokenId from getNameData(label)
 * 2. Call setResolver(tokenId, newResolver) on the registry
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
  name: string
  /** The registry address that manages this name (parent's registry) */
  registryAddress: Address
  /** The new resolver address to set */
  resolverAddress: Address
  walletClient: WalletClient
  publicClient: PublicClient
  signer: Signer
  chainId: number
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
export const changeResolver = async (
  params: ChangeResolverParameters,
): Promise<ChangeResolverResult> => {
  const {
    name,
    registryAddress,
    resolverAddress,
    walletClient,
    publicClient,
    signer,
    chainId,
  } = params

  // Validate wallet client has account and chain
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  // Extract the label (first part of the name)
  const label = name.split('.')[0]

  // Get tokenId from the registry using ensjs
  const [tokenId] = await getRegistryNameData(publicClient, {
    registryAddress,
    label,
  })

  if (tokenId === 0n) {
    throw new Error(`Name "${name}" not found in registry`)
  }

  // Encode the setResolver call
  const data = encodeFunctionData({
    abi: [permissionedRegistrySetResolverSnippet],
    functionName: 'setResolver',
    args: [tokenId, resolverAddress],
  })

  // Start the transaction through the transaction manager
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
      description: `Change resolver for ${name}`,
      publicClient,
      chainId,
    },
  )

  // Wait for the transaction to complete
  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
