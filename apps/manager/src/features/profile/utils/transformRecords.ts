import {
  BASE_RECORDS_KEYS,
  type BaseRecordKey,
  getRecord,
  RECORDS_CATEGORIES,
} from '../data/records'
import type { ProfileRecordsResult } from '../service/profileRecords'
import type { ProfileRecords } from '../types'

export const defaultProfileRecords: ProfileRecords = {
  base: {},
  social: [],
  contact: [],
  addresses: [],
  links: [],
  unknown: [],
}

/**
 * Transforms mock profile records to the standard ProfileRecords format
 * Used for development and testing with mock data
 */
export const transformProfileRecords = (
  profile: ProfileRecordsResult | undefined,
): ProfileRecords => {
  const records: ProfileRecords = {
    base: {},
    social: [],
    contact: [],
    addresses: profile?.coins ?? [],
    links: [],
    unknown: [],
  }

  if (!profile) {
    return records
  }

  for (const { key, value } of profile.texts) {
    const record = getRecord(key)
    if (record) {
      records[record.category].push({ key, value })
    } else if (BASE_RECORDS_KEYS.includes(key as BaseRecordKey)) {
      records.base[key as BaseRecordKey] = value
    } else if (key === 'links') {
      records.links.push(...JSON.parse(value))
    } else {
      records.unknown.push({
        key,
        value,
      })
    }
  }

  return records
}

/**
 * Transforms ProfileRecords back to the format expected by the ENS service
 * This is used when saving changes back to the blockchain
 */
export const transformToServiceFormat = (
  records: ProfileRecords,
): {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string }>
} => {
  const texts: Array<{ key: string; value: string }> = []
  const coins: Array<{ coinType: number; value: string }> = []

  // Add all text records
  for (const category of RECORDS_CATEGORIES) {
    for (const record of records[category]) {
      texts.push({ key: record.key, value: record.value })
    }
  }

  // Add base profile records
  for (const [key, value] of Object.entries(records.base)) {
    texts.push({ key, value })
  }

  // Add unknown records
  for (const record of records.unknown) {
    texts.push({ key: record.key, value: record.value })
  }

  // Add links as JSON string
  if (records.links.length > 0) {
    texts.push({ key: 'links', value: JSON.stringify(records.links) })
  }

  // Add address records
  records.addresses.forEach(({ coinType, value }) => {
    if (value && value.trim() !== '') {
      coins.push({
        coinType,
        value,
      })
    }
  })

  return { texts, coins }
}

/**
 * Debug utility to log the structure of service records
 * Useful for troubleshooting data transformation issues
 */
export const debugServiceRecords = (
  records: ProfileRecordsResult | undefined,
) => {
  console.group('Service Records Debug')
  console.log('Raw records:', records)

  if (records) {
    console.log('Texts count:', records.texts?.length || 0)
    console.log('Coins count:', records.coins?.length || 0)

    if (records.texts) {
      console.log('Text records:', records.texts)
    }

    if (records.coins) {
      console.log('Coin records:', records.coins)
    }
  }

  console.groupEnd()
}

/**
 * Debug utility to log the transformed ProfileRecords structure
 */
export const debugProfileRecords = (records: ProfileRecords | undefined) => {
  if (!records) {
    return
  }

  console.group('Profile Records Debug')
  console.log('Base records:', records.base)
  for (const category of RECORDS_CATEGORIES) {
    console.log(`${category} records:`, records[category])
  }
  console.log('Address records:', records.addresses)
  console.log('Links records:', records.links)
  console.log('Unknown records:', records.unknown)
  console.groupEnd()
}
