import { addressRecords } from './address'
import {
  sections,
  specialSections,
  staticTextRecords,
  textRecords,
} from './text'
import type { AnySection, TextRecordDef } from './types'

export const recordIndex = Object.fromEntries(
  textRecords.map((r) => [r.key, r]),
) as {
  readonly [K in (typeof textRecords)[number]['key']]: Extract<
    (typeof textRecords)[number],
    { key: K }
  >
}

export const addressRecordIndex = Object.fromEntries(
  addressRecords.map((r) => [r.coinType, r]),
) as {
  readonly [K in (typeof addressRecords)[number]['coinType']]: Extract<
    (typeof addressRecords)[number],
    { coinType: K }
  >
}

export const sectionsList = Object.keys(sections) as (keyof typeof sections)[]
export const allSections = [...sectionsList, ...specialSections]

export const forceFetchRecords = {
  always: [
    ...staticTextRecords,
    ...textRecords.filter((r) => r.forceFetch === 'always').map((r) => r.key),
  ],
  whenNotIndexed: textRecords
    .filter((r) => r.forceFetch === 'whenNotIndexed')
    .map((r) => r.key),
}

export const alwaysProbeAddressRecords = ['60']

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
): string => {
  if (!record) return value
  if (record.displayPrefix && value.startsWith(record.displayPrefix)) {
    return value.slice(record.displayPrefix.length)
  }
  return value
}

// Helper accessors
export const getRecordDef = (
  key: string,
): (typeof recordIndex)[keyof typeof recordIndex] | undefined =>
  recordIndex[key as keyof typeof recordIndex]
export const getAddressRecordDef = (
  coinType: number,
): (typeof addressRecordIndex)[number] | undefined =>
  addressRecordIndex[coinType]

export const getAvailableRecords = (
  usedKeys: string[],
  section: AnySection,
): typeof textRecords =>
  textRecords.filter(
    (record) => !usedKeys.includes(record.key) && record.section === section,
  )

export const getAvailableAddressRecords = (
  usedCoinTypes: number[],
): typeof addressRecords =>
  addressRecords.filter((record) => !usedCoinTypes.includes(record.coinType))
