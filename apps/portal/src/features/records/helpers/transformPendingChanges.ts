/**
 * Transform pending record changes to ensjs setRecords format.
 *
 * Converts our internal change tracking state (newRecords, editedValues, deletedIds)
 * to the format expected by ensjs `setRecords`.
 */

import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import { getRecordId } from '@/utils/records/editRecordUtils'

export type SetRecordsInput = {
  texts?: Array<{ key: string; value: string }>
  coins?: Array<{ coin: number; value: string }>
  contentHash?: string | null
}

type PendingChanges = {
  newRecords: EditableRecord[]
  editedValues: Map<string, string>
  deletedIds: Set<string>
}

/**
 * Transforms pending changes into the format expected by ensjs setRecords.
 *
 * @param originalRecords - The original records from the server
 * @param pendingChanges - The pending changes from our state
 * @returns SetRecordsInput ready for ensjs
 *
 * @example
 * const input = transformPendingChangesToSetRecords(originalRecords, {
 *   newRecords: [{ type: 'text', key: 'twitter', value: '@ens' }],
 *   editedValues: new Map([['text-name', 'New Name']]),
 *   deletedIds: new Set(['text-description']),
 * })
 * // { texts: [{ key: 'twitter', value: '@ens' }, { key: 'name', value: 'New Name' }, { key: 'description', value: '' }] }
 */
export function transformPendingChangesToSetRecords(
  originalRecords: NameRecord[],
  pendingChanges: PendingChanges,
): SetRecordsInput {
  const { newRecords, editedValues, deletedIds } = pendingChanges

  const texts: Array<{ key: string; value: string }> = []
  const coins: Array<{ coin: number; value: string }> = []
  let contentHash: string | null | undefined

  // Process new records
  for (const record of newRecords) {
    if (record.type === 'text') {
      texts.push({ key: record.key, value: record.value })
    } else if (record.type === 'address') {
      coins.push({ coin: record.id, value: record.value })
    } else if (record.type === 'contentHash') {
      contentHash = record.value
    }
  }

  // Process edited records
  for (const [id, newValue] of editedValues) {
    // Find the original record to get its type and key
    const originalRecord = originalRecords.find((r) => getRecordId(r) === id)
    if (!originalRecord) continue

    if (originalRecord.type === 'text') {
      texts.push({ key: originalRecord.key, value: newValue })
    } else if (originalRecord.type === 'address') {
      coins.push({ coin: originalRecord.id, value: newValue })
    } else if (originalRecord.type === 'contentHash') {
      contentHash = newValue
    }
  }

  // Process deleted records (set to empty string to delete)
  for (const id of deletedIds) {
    const originalRecord = originalRecords.find((r) => getRecordId(r) === id)
    if (!originalRecord) continue

    if (originalRecord.type === 'text') {
      texts.push({ key: originalRecord.key, value: '' })
    } else if (originalRecord.type === 'address') {
      coins.push({ coin: originalRecord.id, value: '' })
    } else if (originalRecord.type === 'contentHash') {
      contentHash = null
    }
  }

  const result: SetRecordsInput = {}

  if (texts.length > 0) {
    result.texts = texts
  }

  if (coins.length > 0) {
    result.coins = coins
  }

  if (contentHash !== undefined) {
    result.contentHash = contentHash
  }

  return result
}
