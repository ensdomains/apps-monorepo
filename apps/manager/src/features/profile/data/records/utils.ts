import { coinNameToTypeMap } from '@ensdomains/address-encoder'
import { safeRecordHref } from '../../utils/safeUrl'
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

// A CCIP-Read gateway is asked once per record and rate-limits per visitor
// (Coinbase's 429s past ~30 reads a minute), so an offchain name the indexer
// has no keys for reads the records ens-app-v3 shows.
export const offchainProfileRecords = {
  texts: [
    'name',
    'avatar',
    'header',
    'description',
    'url',
    'location',
    'timezone',
    'email',
    'com.twitter',
    'com.github',
    'com.discord',
    'org.telegram',
  ],
  coins: [
    coinNameToTypeMap.eth,
    coinNameToTypeMap.default,
    coinNameToTypeMap.btc,
    coinNameToTypeMap.sol,
    coinNameToTypeMap.op,
    coinNameToTypeMap.arb1,
    coinNameToTypeMap.base,
    coinNameToTypeMap.linea,
    coinNameToTypeMap.scr,
  ],
}

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

// Helper accessors
export const getRecordDef = (
  key: string,
): (typeof recordIndex)[keyof typeof recordIndex] | undefined =>
  Object.hasOwn(recordIndex, key)
    ? recordIndex[key as keyof typeof recordIndex]
    : undefined
export const getAddressRecordDef = (
  coinType: number,
): (typeof addressRecordIndex)[number] | undefined =>
  addressRecordIndex[coinType]

export const getRecordsForSection = (section: AnySection): typeof textRecords =>
  textRecords.filter((record) => record.section === section)

export const getAvailableAddressRecords = (
  usedCoinTypes: number[],
): typeof addressRecords =>
  addressRecords.filter((record) => !usedCoinTypes.includes(record.coinType))
