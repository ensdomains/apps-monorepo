/**
 * Pure async function to save ENS record changes.
 *
 * Encodes against whichever resolver the name actually uses. Every V2 setter
 * takes the DNS-encoded name rather than `bytes32 node`, and `setAddr` is
 * renamed `setAddress`, so the two sets share no selectors: the wrong shape
 * hits the resolver's fallback and reverts with empty data.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters as setRecordsWriteParametersV1 } from '@ensdomains/ensjs/wallet/v1'
import { setRecordsWriteParameters as setRecordsWriteParametersV2 } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { getIsPermissionedResolver } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
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
 * Builds the encoded setRecords transaction. Async because encoding an ABI
 * record may fetch. Shared by {@link saveRecords} and the modal's pre-start gas
 * estimate, so the estimated call matches what's submitted.
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

  // Refuse rather than guess: the wrong shape reverts with empty data, which
  // surfaces as an unusable gas error rather than a decodable failure.
  const kind = await getIsPermissionedResolver({ resolverAddress })
  if (kind.isErr()) {
    throw new Error(`Could not tell what kind of resolver ${name} uses`)
  }

  // Type assertion is safe since we validated account and chain above.
  const client = walletClient as Parameters<
    typeof setRecordsWriteParametersV2
  >[0]
  const setRecordsWriteParameters = kind.value
    ? setRecordsWriteParametersV2
    : setRecordsWriteParametersV1

  const writeParams = await setRecordsWriteParameters(client, {
    name,
    resolverAddress,
    texts: recordsInput.texts,
    coins: recordsInput.coins,
    contentHash: recordsInput.contentHash,
    abi: recordsInput.abi,
  })

  const data = encodeFunctionData({
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
