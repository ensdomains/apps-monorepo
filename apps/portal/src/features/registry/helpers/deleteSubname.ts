/**
 * Pure async function to delete (burn) a subname from an ENS V2 registry.
 *
 * Uses ensjs deleteSubnameV2WriteParameters to build the burn call after
 * resolving the actual token ID via getTokenId(labelhash(label)).
 * The burn also requires the caller to hold ROLE_BURN for the subname.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { permissionedRegistryGetTokenIdSnippet } from '@ensdomains/ensjs/contracts'
import { deleteSubnameV2WriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  labelhash,
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
 * Resolves the actual token ID via ensjs's permissionedRegistryGetTokenIdSnippet,
 * then builds the burn call using deleteSubnameV2WriteParameters.
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

  const tokenId = await publicClient.readContract({
    address: registryAddress,
    abi: permissionedRegistryGetTokenIdSnippet,
    functionName: 'getTokenId',
    args: [BigInt(labelhash(label))],
  })

  if (tokenId === 0n) {
    throw new Error(`Name "${name}" not found in registry`)
  }

  const writeParams = deleteSubnameV2WriteParameters(
    walletClient as Parameters<typeof deleteSubnameV2WriteParameters>[0],
    { registryAddress, label, owner, tokenId },
  )

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  console.log('[deleteSubname] Burn:', {
    label,
    registryAddress,
    tokenId: tokenId.toString(),
    from: walletClient.account.address,
    owner,
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
