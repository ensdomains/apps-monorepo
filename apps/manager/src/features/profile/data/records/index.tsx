import type { RecordDefinition } from '../../types'
import { addressRecords } from './addresses'
import { contactRecords } from './contacts'
import { socialRecords } from './socials'

export const RECORDS_CATEGORIES = ['social', 'contact'] as const
export type RecordCategory = (typeof RECORDS_CATEGORIES)[number]

const records = {
  social: socialRecords,
  contact: contactRecords,
} as const satisfies Record<RecordCategory, RecordDefinition[]>

export const BASE_RECORDS_KEYS = [
  'avatar',
  'header',
  'description',
  'url',
] as const
export type BaseRecordKey = (typeof BASE_RECORDS_KEYS)[number]

// Optimized access - Create index maps for O(1) lookups
const createIndexMap = <T extends RecordDefinition[], C extends RecordCategory>(
  records: T,
  category: C,
) =>
  Object.fromEntries(
    records.map((record) => [record.key, { data: record, category }]),
  )

// Pre-computed lookup maps
export const recordIndex = {
  // ...createIndexMap(bioRecords),
  ...createIndexMap(socialRecords, 'social'),
  ...createIndexMap(contactRecords, 'contact'),
  // [linksRecord.key]: linksRecord,
}

const createCoinTypeMap = <T extends { coinType: number }>(
  records: readonly T[],
) => Object.fromEntries(records.map((record) => [record.coinType, record]))

export const coinTypeIndex = createCoinTypeMap(addressRecords)

// Optimized access functions
export const getRecord = (key: string) => recordIndex[key]
export const getAddressRecord = (coinType: number) => coinTypeIndex[coinType]

export const getAvailableRecords = (
  usedKeys: string[],
  category: RecordCategory,
) => records[category].filter((record) => !usedKeys.includes(record.key))

export const getAvailableAddressRecords = (usedCoinTypes: number[]) =>
  addressRecords.filter((record) => !usedCoinTypes.includes(record.coinType))

// Export arrays for backward compatibility
// export { bioRecords as bioRecordsArray }
export { socialRecords as socialRecordsArray }
export { contactRecords as contactRecordsArray }
export { addressRecords as addressRecordsArray }
