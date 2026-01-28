import { match } from 'ts-pattern'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'

/** Editable record that extends NameRecord with edit state */
export type EditableRecord = NameRecord & {
  isEdited?: boolean
  isNew?: boolean
  isDeleted?: boolean
}

/** Record types available for creation */
export type RecordType = 'text' | 'address' | 'abi' | 'contentHash'

/**
 * Gets a unique identifier for a record based on its type and key.
 *
 * @param record - The record to get an ID for
 * @returns A unique string identifier
 *
 * @example
 * getRecordId({ type: 'text', key: 'name', value: 'John' })
 * // 'text-name'
 *
 * @example
 * getRecordId({ type: 'address', key: 'ETH', value: '0x...', id: 60 })
 * // 'address-60'
 *
 * @example
 * getRecordId({ type: 'contentHash', value: 'ipfs://...' })
 * // 'contentHash'
 */
export const getRecordId = (record: NameRecord): string => {
  if (record.type === 'contentHash') {
    return 'contentHash'
  }
  if (record.type === 'address') {
    return `address-${record.id}`
  }
  return `text-${record.key}`
}

/**
 * Merges original records with pending changes (edits, deletions, new records).
 * Returns a new array with appropriate flags set on each record.
 *
 * @param originalRecords - The original records from the server
 * @param newRecords - Records added by the user
 * @param editedValues - Map of record ID to new value for edited records
 * @param deletedIds - Set of record IDs marked for deletion
 * @returns Merged array with isEdited, isDeleted, or isNew flags set
 *
 * @example
 * mergeRecordsWithChanges(
 *   [{ type: 'text', key: 'name', value: 'John' }],
 *   [{ type: 'text', key: 'bio', value: 'Hello' }],
 *   new Map([['text-name', 'Jane']]),
 *   new Set(),
 * )
 * // [
 * //   { type: 'text', key: 'name', value: 'Jane', isEdited: true },
 * //   { type: 'text', key: 'bio', value: 'Hello', isNew: true },
 * // ]
 */
export function mergeRecordsWithChanges(
  originalRecords: NameRecord[],
  newRecords: EditableRecord[],
  editedValues: Map<string, string>,
  deletedIds: Set<string>,
): EditableRecord[] {
  const merged: EditableRecord[] = []

  // Add original records with edit/delete state
  for (const record of originalRecords) {
    const id = getRecordId(record)
    if (deletedIds.has(id)) {
      merged.push({ ...record, isDeleted: true })
    } else if (editedValues.has(id)) {
      merged.push({
        ...record,
        value: editedValues.get(id) ?? record.value,
        isEdited: true,
      })
    } else {
      merged.push(record)
    }
  }

  // Add new records
  for (const record of newRecords) {
    merged.push({ ...record, isNew: true })
  }

  return merged
}

/**
 * Creates a new record object based on the specified type.
 * Uses exhaustive pattern matching to ensure all types are handled.
 *
 * @param type - The type of record to create
 * @param key - The key/name for the record (ignored for contentHash)
 * @param value - The value for the record
 * @returns A new EditableRecord object
 *
 * @example
 * createNewRecord('text', 'name', 'John')
 * // { type: 'text', key: 'name', value: 'John' }
 *
 * @example
 * createNewRecord('address', 'ETH', '0x123...')
 * // { type: 'address', key: 'ETH', value: '0x123...', id: 60 }
 *
 * @example
 * createNewRecord('contentHash', '', 'ipfs://...')
 * // { type: 'contentHash', value: 'ipfs://...' }
 */
export function createNewRecord(
  type: RecordType,
  key: string,
  value: string,
): EditableRecord {
  return match(type)
    .with('text', () => ({ type: 'text' as const, key, value }))
    .with('address', () => ({
      type: 'address' as const,
      key,
      value,
      id: 60, // Default to ETH coin type
    }))
    .with('contentHash', () => ({ type: 'contentHash' as const, value }))
    .with('abi', () => ({ type: 'text' as const, key, value })) // ABI treated as text for now
    .exhaustive()
}
