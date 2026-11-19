import { safeRecordHref } from '../../utils/safeUrl'
import { textRecords } from './text'
import type { TextRecordDef } from './types'

const RECORD_INDEX = new Map(textRecords.map((record) => [record.key, record]))

/**
 * Generates a URL for a given text record and value, if the record supports linking.
 *
 * @param record - The text record definition, which may include an href property.
 * @param value - The value to be appended or passed to the href.
 * @returns The constructed URL as a string, or undefined if the record does not support linking.
 */
export const getRecordHref = (
  record: TextRecordDef | undefined,
  value: string,
): string | undefined => {
  if (!record || !('href' in record)) return undefined
  const displayValue = getRecordDisplayValue(record, value)
  const href =
    typeof record.href === 'function'
      ? record.href(displayValue)
      : record.href + encodeURIComponent(displayValue || '')
  return safeRecordHref(href)
}

export const getRecordDisplayValue = (
  record: TextRecordDef | undefined,
  value: string,
): string => {
  if (!record) return value
  const displayValue =
    record.displayPrefix && value.startsWith(record.displayPrefix)
      ? value.slice(record.displayPrefix.length)
      : value

  if (record.normalize) {
    return record.normalize(displayValue)
  }

  return displayValue
}

export const getRecordDef = (key: string): TextRecordDef | undefined =>
  RECORD_INDEX.get(key)
