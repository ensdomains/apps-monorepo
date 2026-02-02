/**
 * Pure async function to save ENS record changes.
 *
 * Uses the dedicated resolver pattern with multicallWithNodeCheck,
 * similar to the manager app's saveRecords implementation.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  dedicatedResolverMulticallWithNodeCheckSnippet,
  dedicatedResolverSetAddrSnippet,
  dedicatedResolverSetTextSnippet,
} from '@ensdomains/ensjs/contracts'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  namehash,
  type PublicClient,
} from 'viem'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import {
  type SetRecordsInput,
  transformPendingChangesToSetRecords,
} from './transformPendingChanges'

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
  publicClient: PublicClient
  accountAddress: Address
  signer: Signer
  chainId: number
}

export interface SaveRecordsResult {
  txId: string
  hash: Hex
}

// ============================================================================
// Pure functions
// ============================================================================

/**
 * Build the calls array for multicallWithNodeCheck from SetRecordsInput.
 */
function buildDedicatedResolverCalls(input: SetRecordsInput): Hex[] {
  const calls: Hex[] = []

  // Encode text records
  if (input.texts) {
    for (const { key, value } of input.texts) {
      calls.push(
        encodeFunctionData({
          abi: dedicatedResolverSetTextSnippet,
          functionName: 'setText',
          args: [key, value],
        }),
      )
    }
  }

  // Encode address records
  if (input.coins) {
    for (const { coin, value } of input.coins) {
      calls.push(
        encodeFunctionData({
          abi: dedicatedResolverSetAddrSnippet,
          functionName: 'setAddr',
          args: [BigInt(coin), value as Hex],
        }),
      )
    }
  }

  // Note: contentHash is not yet supported in dedicated resolver

  return calls
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Save records to the blockchain using the dedicated resolver pattern.
 *
 * Pure async function that builds the request, starts the transaction,
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
 *   publicClient,
 *   accountAddress,
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
    publicClient,
    accountAddress,
    signer,
    chainId,
  } = params

  // Transform pending changes to ensjs-compatible format
  const recordsInput = transformPendingChangesToSetRecords(
    originalRecords,
    pendingChanges,
  )

  // Build the calls for multicallWithNodeCheck
  const calls = buildDedicatedResolverCalls(recordsInput)

  if (calls.length === 0) {
    throw new Error('No record changes to save')
  }

  // Build the multicall data
  const node = namehash(name) as Hex
  const multicallData = encodeFunctionData({
    abi: dedicatedResolverMulticallWithNodeCheckSnippet,
    functionName: 'multicallWithNodeCheck',
    args: [node, calls],
  })

  // Start the transaction through the transaction manager
  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: accountAddress,
        to: resolverAddress,
        data: multicallData,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
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
