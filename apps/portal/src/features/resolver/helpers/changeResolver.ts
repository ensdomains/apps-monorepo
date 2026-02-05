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
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { readContract } from 'viem/actions'

// ============================================================================
// ABI for V2 Registry
// ============================================================================

const REGISTRY_ABI = [
  {
    inputs: [{ internalType: 'string', name: 'label', type: 'string' }],
    name: 'getNameData',
    outputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      {
        components: [
          { internalType: 'uint64', name: 'expiry', type: 'uint64' },
          { internalType: 'uint32', name: 'tokenVersionId', type: 'uint32' },
          { internalType: 'address', name: 'subregistry', type: 'address' },
          { internalType: 'uint32', name: 'eacVersionId', type: 'uint32' },
          { internalType: 'address', name: 'resolver', type: 'address' },
        ],
        internalType: 'struct IRegistryDatastore.Entry',
        name: 'entry',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'address', name: 'resolver', type: 'address' },
    ],
    name: 'setResolver',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

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
export async function changeResolver(
  params: ChangeResolverParameters,
): Promise<ChangeResolverResult> {
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

  // Get tokenId from the registry using getNameData
  const [tokenId] = await readContract(publicClient, {
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'getNameData',
    args: [label],
  })

  if (tokenId === 0n) {
    throw new Error(`Name "${name}" not found in registry`)
  }

  // Encode the setResolver call
  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
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
