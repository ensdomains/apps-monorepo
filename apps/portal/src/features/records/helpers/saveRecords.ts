/**
 * Pure async function to save ENS record changes.
 *
 * Uses ensjs's setRecordsWriteParameters which supports both:
 * - Public Resolver (V1): multicall(calls)
 * - Dedicated Resolver (V2): multicallWithNodeCheck(node, calls)
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import { transformPendingChangesToSetRecords } from './transformPendingChanges'

// ============================================================================
// Types
// ============================================================================

type PendingChanges = {
  newRecords: EditableRecord[]
  editedValues: Map<string, string>
  deletedIds: Set<string>
}

export type SaveRecordsParameters = {
  name: string
  resolverAddress: Address
  originalRecords: NameRecord[]
  pendingChanges: PendingChanges
  walletClient: WalletClient
  publicClient: PublicClient
  signer: Signer
  chainId: number
  id: string
}

export interface SaveRecordsResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Save records to the blockchain.
 *
 * Pure async function that builds the request using ensjs's setRecordsWriteParameters, starts the transaction,
 * and waits for it to complete. Returns the transaction result.
 *
 * @throws Error if no changes to apply, wallet not connected, or transaction fails
 *
 * @example
 * ```ts
 * const mutation = useMutation({
 *   mutationFn: saveRecords,
 *   onSuccess: () => refetchRecords(),
 * })
 *
 * mutation.mutate({
 *   name: 'myname.eth',
 *   resolverAddress,
 *   originalRecords,
 *   pendingChanges,
 *   walletClient,
 *   publicClient,
 *   signer,
 *   chainId: 11155111,
 * })
 * ```
 */
export async function saveRecords(
  params: SaveRecordsParameters,
): Promise<SaveRecordsResult> {
  const {
    name,
    resolverAddress,
    originalRecords,
    pendingChanges,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
  } = params

  // Validate wallet client has account and chain
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  // Transform pending changes to ensjs-compatible format
  const recordsInput = transformPendingChangesToSetRecords(
    originalRecords,
    pendingChanges,
  )

  // Check if there are any changes
  const hasChanges =
    (recordsInput.texts?.length ?? 0) > 0 ||
    (recordsInput.coins?.length ?? 0) > 0 ||
    recordsInput.contentHash !== undefined ||
    recordsInput.abi !== undefined

  if (!hasChanges) {
    throw new Error('No record changes to save')
  }

  // Use ensjs to build the write parameters
  // This handles both Public Resolver and Dedicated Resolver patterns
  // Type assertion is safe since we validated account and chain above
  const client = walletClient as Parameters<typeof setRecordsWriteParameters>[0]

  const writeParams = await setRecordsWriteParameters(client, {
    name,
    resolverAddress,
    texts: recordsInput.texts,
    coins: recordsInput.coins,
    contentHash: recordsInput.contentHash,
    abi: recordsInput.abi,
  })

  // Encode the transaction data from write parameters
  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  // Start the transaction through the transaction manager
  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletClient.account.address,
        to: resolverAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Update records for ${name}`,
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
