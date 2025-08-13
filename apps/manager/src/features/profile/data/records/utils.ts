import { addressRecords } from './address'
import { sections, specialSections, textRecords } from './text'
import type { AnySection, TextRecordDef } from './types'

// // Grouped accessors
// export const socialRecords = textRecords.filter(
//   (r) => r.section === 'social',
// ) as readonly RecordDefinition[]

// export const contactRecords = textRecords.filter(
//   (r) => r.section === 'contact',
// ) as readonly RecordDefinition[]

// const recordsByCategory = {
//   social: socialRecords,
//   contact: contactRecords,
// } as const satisfies Record<RecordCategory, readonly RecordDefinition[]>

// // Indexes for fast lookup
// const createRecordIndex = <
//   T extends readonly RecordDefinition[],
//   C extends RecordCategory,
// >(
//   defs: T,
//   category: C,
// ) => Object.fromEntries(defs.map((def) => [def.key, { data: def, category }]))

export const recordIndex = Object.fromEntries(
  textRecords.map((r) => [r.key, r]),
) as {
  readonly [K in (typeof textRecords)[number]['key']]: Extract<
    (typeof textRecords)[number],
    { key: K }
  >
}

export const sectionsList = Object.keys(sections) as (keyof typeof sections)[]
export const allSections = [...sectionsList, ...specialSections]

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
  if (typeof record.href === 'function') return record.href(value)
  return record.href + encodeURIComponent(value || '')
}

export const getRecordDisplayValue = (
  record: TextRecordDef | undefined,
  value: string,
) => {
  if (!record) return value
  if (record.displayPrefix && value.startsWith(record.displayPrefix)) {
    return value.slice(record.displayPrefix.length)
  }
  return value
}

// Helper accessors
export const getRecordDef = (key: string) =>
  recordIndex[key as keyof typeof recordIndex]
export const getAddressRecordDef = (coinType: number) =>
  addressRecords[coinType]

export const getAvailableRecords = (usedKeys: string[], section: AnySection) =>
  textRecords.filter(
    (record) => !usedKeys.includes(record.key) && record.section === section,
  )

export const getAvailableAddressRecords = (usedCoinTypes: number[]) =>
  addressRecords.filter((record) => !usedCoinTypes.includes(record.coinType))
