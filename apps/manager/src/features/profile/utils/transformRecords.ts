import * as v from 'valibot'
import { allSections, getRecordDef, staticTextRecords } from '../data/records'
import type {
  Section,
  SpecialSection,
  StaticRecordKey,
} from '../data/records/types'
import type { ProfileRecordsResult } from '../service/profileRecords'
import type { ProfileRecords } from '../types'

export const newEmptyProfileRecords = (): ProfileRecords => ({
  base: {},
  addresses: [],
  links: [],
  unknown: [],
  ...allSections.reduce(
    (acc, key) => {
      acc[key] = []
      return acc
    },
    {} as Pick<ProfileRecords, Section | SpecialSection>,
  ),
})
export const defaultProfileRecords = newEmptyProfileRecords()

const LinksSchema = v.array(
  v.object({
    name: v.string(),
    url: v.string(),
  }),
)

/**
 * Transforms mock profile records to the standard ProfileRecords format
 * Used for development and testing with mock data
 */
export const transformProfileRecords = (
  profile: ProfileRecordsResult | undefined,
): ProfileRecords => {
  if (!profile) {
    return newEmptyProfileRecords()
  }

  const processTextRecord = (
    acc: ProfileRecords,
    { key, value }: { key: string; value: string },
  ): ProfileRecords => {
    const record = getRecordDef(key)

    if (record) {
      return {
        ...acc,
        [record.section]: [...acc[record.section], { key, value }],
      }
    }

    if (staticTextRecords.includes(key as StaticRecordKey)) {
      return {
        ...acc,
        base: { ...acc.base, [key]: value },
      }
    }

    if (key === 'links') {
      const links = v.parse(LinksSchema, JSON.parse(value))
      return {
        ...acc,
        links: [...acc.links, ...links],
      }
    }

    return {
      ...acc,
      unknown: [...acc.unknown, { key, value }],
    }
  }

  const baseRecords = newEmptyProfileRecords()
  const withAddresses: ProfileRecords = {
    ...baseRecords,
    addresses: profile.coins,
    resolverAddress: profile.resolverAddress,
  }

  return profile.texts.reduce(processTextRecord, withAddresses)
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
  const sectionTexts = allSections.flatMap((section) =>
    records[section].map(({ key, value }) => ({ key, value })),
  )

  const baseTexts = Object.entries(records.base).map(([key, value]) => ({
    key,
    value,
  }))

  const unknownTexts = records.unknown.map(({ key, value }) => ({
    key,
    value,
  }))

  const linksText =
    records.links.length > 0
      ? [{ key: 'links', value: JSON.stringify(records.links) }]
      : []

  const texts = [...sectionTexts, ...baseTexts, ...unknownTexts, ...linksText]

  const coins = records.addresses
    .filter(({ value }) => value && value.trim() !== '')
    .map(({ coinType, value }) => ({ coinType, value }))

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
  for (const section of allSections) {
    console.log(`${section} records:`, records[section])
  }
  console.log('Address records:', records.addresses)
  console.log('Links records:', records.links)
  console.log('Unknown records:', records.unknown)
  console.groupEnd()
}
