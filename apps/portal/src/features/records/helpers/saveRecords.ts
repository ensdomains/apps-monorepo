/**
 * Pure async function to save ENS record changes.
 *
 * Uses ensjs's setRecordsWriteParameters which supports both:
 * - Public Resolver (V1): multicall(calls)
 * - Dedicated Resolver (V2): multicallWithNodeCheck(node, calls)
 *
 * For a post-audit-2 `PermissionedResolver` (contracts-v2 PR #417) the inner
 * calls are translated from the legacy node-based setters ensjs still emits to
 * the name-based ones (`setAddress(name, ...)`, `setText(name, ...)`, ...) and
 * sent as a plain `multicall(calls)`.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet/v1'
import {
  type Address,
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbi,
  toHex,
  type WalletClient,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'
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

export type SaveRecordsTransactionParameters = {
  name: string
  resolverAddress: Address
  originalRecords: NameRecord[]
  pendingChanges: PendingChanges
  walletClient: WalletClient
  chainId: number
  /** The resolver is a post-audit-2 `PermissionedResolver` (name-based setters). */
  isPermissionedResolver?: boolean
}

/** Legacy node-based setters ensjs encodes inside its `multicall`. */
const legacySetterAbi = parseAbi([
  'function setAddr(bytes32 node, uint256 coinType, bytes a)',
  'function setAddr(bytes32 node, address a)',
  'function setText(bytes32 node, string key, string value)',
  'function setContenthash(bytes32 node, bytes hash)',
  'function setABI(bytes32 node, uint256 contentType, bytes data)',
])

const ETH_COIN_TYPE = 60n

/**
 * Re-encode legacy `set*(node, ...)` calls as the post-audit-2 name-based
 * setters. The values are already ABI-encoded the way both contracts expect
 * (address bytes, text strings, contenthash, ABI payload); only the selector
 * and the first argument change.
 */
export const translateLegacyRecordCalls = (
  calls: readonly Hex[],
  name: string,
): Hex[] => {
  const dnsName = toHex(packetToBytes(name))

  return calls.map((call) => {
    const decoded = decodeFunctionData({ abi: legacySetterAbi, data: call })

    switch (decoded.functionName) {
      case 'setAddr': {
        if (decoded.args.length === 2) {
          const [, address] = decoded.args
          return encodeFunctionData({
            abi: permissionedResolverAbi,
            functionName: 'setAddress',
            args: [dnsName, ETH_COIN_TYPE, address],
          })
        }
        const [, coinType, addressBytes] = decoded.args
        return encodeFunctionData({
          abi: permissionedResolverAbi,
          functionName: 'setAddress',
          args: [dnsName, coinType, addressBytes],
        })
      }
      case 'setText': {
        const [, key, value] = decoded.args
        return encodeFunctionData({
          abi: permissionedResolverAbi,
          functionName: 'setText',
          args: [dnsName, key, value],
        })
      }
      case 'setContenthash': {
        const [, hash] = decoded.args
        return encodeFunctionData({
          abi: permissionedResolverAbi,
          functionName: 'setContenthash',
          args: [dnsName, hash],
        })
      }
      case 'setABI': {
        const [, contentType, data] = decoded.args
        return encodeFunctionData({
          abi: permissionedResolverAbi,
          functionName: 'setABI',
          args: [dnsName, contentType, data],
        })
      }
      default:
        throw new Error('Unsupported legacy record call')
    }
  })
}

/** The inner calls of an ensjs `multicall` / `multicallWithNodeCheck`. */
const extractMulticallCalls = (args: readonly unknown[]): readonly Hex[] => {
  const calls = args[args.length - 1]
  if (!Array.isArray(calls)) {
    throw new Error('Unexpected setRecords encoding: no multicall calls')
  }
  return calls as readonly Hex[]
}

export type SaveRecordsParameters = SaveRecordsTransactionParameters & {
  publicClient: PublicClient
  signer: Signer
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
/**
 * Builds the encoded setRecords transaction. Async because ensjs'
 * `setRecordsWriteParameters` resolves the resolver pattern (Public vs Dedicated
 * resolver) on chain. Shared by {@link saveRecords} and the modal's pre-start
 * gas estimate, so the estimated call matches what's submitted.
 *
 * @throws if the wallet isn't ready or there are no record changes.
 */
export async function prepareSaveRecordsTransaction({
  name,
  resolverAddress,
  originalRecords,
  pendingChanges,
  walletClient,
  chainId,
  isPermissionedResolver = false,
}: SaveRecordsTransactionParameters): Promise<CustomTransactionIntent> {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  // Transform pending changes to ensjs-compatible format
  const recordsInput = transformPendingChangesToSetRecords(
    originalRecords,
    pendingChanges,
  )

  const hasChanges =
    (recordsInput.texts?.length ?? 0) > 0 ||
    (recordsInput.coins?.length ?? 0) > 0 ||
    recordsInput.contentHash !== undefined ||
    recordsInput.abi !== undefined

  if (!hasChanges) {
    throw new Error('No record changes to save')
  }

  // ensjs handles both Public Resolver and Dedicated Resolver patterns.
  // Type assertion is safe since we validated account and chain above.
  const client = walletClient as Parameters<typeof setRecordsWriteParameters>[0]

  const writeParams = await setRecordsWriteParameters(client, {
    name,
    resolverAddress,
    texts: recordsInput.texts,
    coins: recordsInput.coins,
    contentHash: recordsInput.contentHash,
    abi: recordsInput.abi,
  })

  const data = isPermissionedResolver
    ? encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: 'multicall',
        args: [
          translateLegacyRecordCalls(
            extractMulticallCalls(writeParams.args as readonly unknown[]),
            name,
          ),
        ],
      })
    : encodeFunctionData({
        abi: writeParams.abi,
        functionName: writeParams.functionName,
        args: writeParams.args,
      } as Parameters<typeof encodeFunctionData>[0])

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data,
    chainId,
  })
}

export async function saveRecords(
  params: SaveRecordsParameters,
): Promise<SaveRecordsResult> {
  const { name, publicClient, signer, chainId, id } = params

  const intent = await prepareSaveRecordsTransaction(params)

  const txId = transactionManager.startTransaction(intent, signer, {
    id,
    description: `Update records for ${name}`,
    publicClient,
    chainId,
  })

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
