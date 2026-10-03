/**
 * Transform pending record changes to ensjs setRecords format.
 *
 * Converts our internal change tracking state (newRecords, editedValues, deletedIds)
 * to the format expected by ensjs `setRecords`.
 */

import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import { getRecordId } from '@/utils/records/editRecordUtils'

/** ABI encoding format as expected by ensjs */
type AbiInputJson = {
  encodeAs: 'json'
  data: Record<string, unknown> | Record<string, unknown>[] | null
}

type AbiInput = AbiInputJson

export type SetRecordsInput = {
  texts?: Array<{ key: string; value: string }>
  coins?: Array<{ coin: number; value: string }>
  contentHash?: string | null
  abi?: AbiInput
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
 * // { texts: [{ key: 'description', value: '' }, { key: 'name', value: 'New Name' }, { key: 'twitter', value: '@ens' }] }
 */
export function transformPendingChangesToSetRecords(
  originalRecords: NameRecord[],
  pendingChanges: PendingChanges,
): SetRecordsInput {
  const { newRecords, editedValues, deletedIds } = pendingChanges

  // One entry per key, so a delete and an add on the same key coalesce into a
  // single write instead of a set followed by a clear that erases it.
  const texts = new Map<string, string>()
  const coins = new Map<number, string>()
  let contentHash: string | null | undefined
  let abi: AbiInput | undefined

  /**
   * Parse ABI JSON string to object for ensjs.
   * Returns null data if empty/invalid (to delete the ABI).
   */
  const parseAbiValue = (value: string): AbiInput | undefined => {
    if (!value || value.trim() === '') {
      return { encodeAs: 'json', data: null }
    }
    try {
      const parsed = JSON.parse(value) as
        | Record<string, unknown>
        | Record<string, unknown>[]
      return { encodeAs: 'json', data: parsed }
    } catch {
      // Invalid JSON - treat as null to avoid errors
      console.warn('Invalid ABI JSON:', value)
      return undefined
    }
  }

  const findOriginalRecord = (id: string) =>
    originalRecords.find((r) => getRecordId(r) === id)

  // Deletions first, then edits, then additions: a later change on the same
  // key replaces an earlier one, so a replacement always wins over its delete.
  // `null` marks a deletion.
  const changes: Array<{
    record: NameRecord | EditableRecord | undefined
    value: string | null
  }> = [
    ...[...deletedIds].map((id) => ({
      record: findOriginalRecord(id),
      value: null,
    })),
    ...[...editedValues].map(([id, value]) => ({
      record: findOriginalRecord(id),
      value,
    })),
    ...newRecords.map((record) => ({ record, value: record.value })),
  ]

  for (const { record, value } of changes) {
    switch (record?.type) {
      case 'text':
        texts.set(record.key, value ?? '')
        break
      case 'address':
        coins.set(record.id, value ?? '')
        break
      case 'contentHash':
        contentHash = value
        break
      case 'abi':
        abi =
          value === null
            ? { encodeAs: 'json', data: null }
            : parseAbiValue(value)
        break
    }
  }

  const result: SetRecordsInput = {}

  // Clears before sets, so no clear can land after a set in the multicall.
  const clearsFirst = <T extends { value: string }>(items: T[]) =>
    items.sort((a, b) => Number(!!a.value) - Number(!!b.value))

  if (texts.size > 0) {
    result.texts = clearsFirst(
      [...texts].map(([key, value]) => ({ key, value })),
    )
  }

  if (coins.size > 0) {
    result.coins = clearsFirst(
      [...coins].map(([coin, value]) => ({ coin, value })),
    )
  }

  if (contentHash !== undefined) {
    result.contentHash = contentHash
  }

  if (abi !== undefined) {
    result.abi = abi
  }

  return result
}
