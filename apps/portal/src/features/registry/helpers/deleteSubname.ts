/**
 * Pure async function to delete (burn) a subname from an ENS V2 registry.
 *
 * Follows the same pattern as changeResolver:
 * 1. Get tokenId from registry (getRegistryNameData)
 * 2. Encode ERC-1155 burn call with the real tokenId
 * 3. Submit via transaction manager
 * 4. Wait for confirmation
 *
 * IMPORTANT: We must query the actual tokenId from the registry rather than
 * using labelhash directly, because token IDs can change via regeneration.
 * This is the same approach changeResolver uses.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { erc1155BurnSnippet } from '@ensdomains/ensjs/contracts'
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

export interface DeleteSubnameParameters {
  /** The full subname (e.g., 'cold.domico.eth') – used only for description */
  readonly name: string
  /** The label of the subname (e.g., 'cold' for cold.domico.eth) */
  readonly label: string
  /** The parent registry (subregistry) address that manages this subname */
  readonly registryAddress: Address
  /** The current owner of the subname (account to burn from) */
  readonly owner: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
}

export interface DeleteSubnameResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Delete a subname by burning its ERC-1155 token in the parent registry.
 *
 * Queries the real tokenId from the registry first (same as changeResolver),
 * then encodes a burn call with that tokenId.
 *
 * @throws Error if wallet not connected, name not found, or transaction fails
 */
export const deleteSubname = async (
  params: DeleteSubnameParameters,
): Promise<DeleteSubnameResult> => {
  const {
    name,
    label,
    registryAddress,
    owner,
    walletClient,
    publicClient,
    signer,
    chainId,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  // Step 1: Get the real tokenId from the registry (same as changeResolver)
  const [tokenId] = await getRegistryNameData(publicClient, {
    registryAddress,
    label,
  })

  if (tokenId === 0n) {
    throw new Error(`Name "${name}" not found in registry`)
  }

  console.log('[deleteSubname] Registry lookup:', {
    label,
    registryAddress,
    tokenId: tokenId.toString(),
  })

  // Step 2: Encode burn(owner, tokenId, 1) using the real tokenId
  const data = encodeFunctionData({
    abi: erc1155BurnSnippet,
    functionName: 'burn',
    args: [owner, tokenId, 1n],
  })

  console.log('[deleteSubname] Encoded transaction:', {
    from: walletClient.account.address,
    to: registryAddress,
    owner,
    tokenId: tokenId.toString(),
    chainId,
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
      description: `Delete subname ${name}`,
      publicClient,
      chainId,
    },
  )

  console.log('[deleteSubname] Transaction started, txId:', txId)

  const result = await waitForTransaction(txId)

  console.log('[deleteSubname] Transaction result:', {
    txId,
    hash: result.hash,
  })

  return {
    txId,
    hash: result.hash,
  }
}
