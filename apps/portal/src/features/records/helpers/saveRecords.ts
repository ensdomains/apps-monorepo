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
  type Address,
  bytesToHex,
  encodeFunctionData,
  type Hex,
  namehash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'

// ============================================================================
// Constants
// ============================================================================

const DEDICATED_RESOLVER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'coinType', type: 'uint256' },
      { internalType: 'bytes', name: 'addressBytes', type: 'bytes' },
    ],
    name: 'setAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'key', type: 'string' },
      { internalType: 'string', name: 'value', type: 'string' },
    ],
    name: 'setText',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: '', type: 'bytes32' },
      { internalType: 'bytes[]', name: 'calls', type: 'bytes[]' },
    ],
    name: 'multicallWithNodeCheck',
    outputs: [{ internalType: 'bytes[]', name: '', type: 'bytes[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// ============================================================================
// Types
// ============================================================================

type PendingChanges = {
  newRecords: EditableRecord[]
  editedValues: Map<string, string>
  deletedIds: Set<string>
}

export type SaveRecordsParams = {
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
 * Get a unique ID for a record (matches getRecordId in editRecordUtils).
 */
function getRecordId(record: NameRecord): string {
  if (record.type === 'contentHash') return 'contentHash'
  if (record.type === 'address') return `address-${record.id}`
  return `text-${record.key}`
}

/**
 * Build the calls array for multicallWithNodeCheck from pending changes.
 */
function buildDedicatedResolverCalls(
  originalRecords: NameRecord[],
  pendingChanges: PendingChanges,
): Hex[] {
  const calls: Hex[] = []

  // Handle edited records
  for (const [id, newValue] of pendingChanges.editedValues) {
    const original = originalRecords.find((r) => getRecordId(r) === id)
    if (!original) continue

    if (original.type === 'text') {
      calls.push(
        encodeFunctionData({
          abi: DEDICATED_RESOLVER_ABI,
          functionName: 'setText',
          args: [original.key, newValue],
        }),
      )
    } else if (original.type === 'address') {
      // For addresses, we need to encode the address bytes
      // For simplicity, treat as hex if it looks like one, otherwise skip
      const addressBytes = newValue.startsWith('0x')
        ? (newValue as Hex)
        : bytesToHex(new TextEncoder().encode(newValue))
      calls.push(
        encodeFunctionData({
          abi: DEDICATED_RESOLVER_ABI,
          functionName: 'setAddr',
          args: [BigInt(original.id), addressBytes],
        }),
      )
    }
  }

  // Handle new records
  for (const record of pendingChanges.newRecords) {
    if (record.type === 'text' && 'key' in record) {
      calls.push(
        encodeFunctionData({
          abi: DEDICATED_RESOLVER_ABI,
          functionName: 'setText',
          args: [record.key, record.value],
        }),
      )
    } else if (record.type === 'address' && 'id' in record) {
      const addressBytes = record.value.startsWith('0x')
        ? (record.value as Hex)
        : bytesToHex(new TextEncoder().encode(record.value))
      calls.push(
        encodeFunctionData({
          abi: DEDICATED_RESOLVER_ABI,
          functionName: 'setAddr',
          args: [BigInt(record.id), addressBytes],
        }),
      )
    }
  }

  // Handle deleted records (set to empty/zero)
  for (const id of pendingChanges.deletedIds) {
    const original = originalRecords.find((r) => getRecordId(r) === id)
    if (!original) continue

    if (original.type === 'text') {
      calls.push(
        encodeFunctionData({
          abi: DEDICATED_RESOLVER_ABI,
          functionName: 'setText',
          args: [original.key, ''], // Empty string to delete
        }),
      )
    } else if (original.type === 'address') {
      calls.push(
        encodeFunctionData({
          abi: DEDICATED_RESOLVER_ABI,
          functionName: 'setAddr',
          args: [BigInt(original.id), zeroAddress], // Zero address to delete
        }),
      )
    }
  }

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
  params: SaveRecordsParams,
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

  // Build the calls for multicallWithNodeCheck
  const calls = buildDedicatedResolverCalls(originalRecords, pendingChanges)

  if (calls.length === 0) {
    throw new Error('No record changes to save')
  }

  console.log('📝 [SAVE_RECORDS] Building transaction:', {
    name,
    resolverAddress,
    callsCount: calls.length,
    accountAddress,
  })

  // Build the multicall data
  const node = namehash(name) as Hex
  const multicallData = encodeFunctionData({
    abi: DEDICATED_RESOLVER_ABI,
    functionName: 'multicallWithNodeCheck',
    args: [node, calls],
  })

  console.log('🚀 [SAVE_RECORDS] Starting transaction:', {
    name,
    resolverAddress,
    signerType: signer.type,
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

  console.log('📝 [SAVE_RECORDS] Transaction started:', { txId })

  // Wait for the transaction to complete
  const result = await waitForTransaction(txId)

  console.log('✅ [SAVE_RECORDS] Transaction completed:', {
    txId,
    hash: result.hash,
  })

  return {
    txId,
    hash: result.hash,
  }
}
