import * as v from 'valibot'
import {
  allSections,
  getRecordDef,
  getRecordDisplayValue,
  staticTextRecords,
} from '../data/records'
import type {
  Section,
  SpecialSection,
  StaticRecordKey,
} from '../data/records/types'
import type { ProfileRecordsResult } from '../service/profileRecords'
import type { LinkItem, ProfileRecords, TextRecordValue } from '../types'
import {
  isAgentRegistrationKey,
  transformAgentRegistrationRecord,
} from './agentRegistration'
import { MAX_PROFILE_LINKS, MAX_PROFILE_LINKS_RECORD_BYTES } from './linkLimits'
import { createSafeUrlSchema, isSafeHttpUrl } from './safeUrl'

const emptyProfileRecords = (): ProfileRecords => ({
  base: {},
  addresses: [],
  links: [],
  contentHash: undefined,
  abi: undefined,
  unknown: [],
  agentRegistrations: [],
  ...allSections.reduce(
    (acc, key) => {
      acc[key] = []
      return acc
    },
    {} as Pick<ProfileRecords, Section | SpecialSection>,
  ),
})

export const newEmptyProfileRecords = (): ProfileRecords =>
  emptyProfileRecords()
export const defaultProfileRecords = newEmptyProfileRecords()

const LinkItemSchema = v.object({
  name: v.string(),
  url: createSafeUrlSchema('Only http(s) URLs are allowed'),
})
const parseLinksJson = (rawValue: string, limit: number): LinkItem[] => {
  // Check code units first so measuring UTF-8 cannot allocate an unbounded buffer.
  if (
    limit <= 0 ||
    rawValue.length > MAX_PROFILE_LINKS_RECORD_BYTES ||
    new TextEncoder().encode(rawValue).byteLength >
      MAX_PROFILE_LINKS_RECORD_BYTES
  ) {
    return []
  }

  let raw: unknown
  try {
    raw = JSON.parse(rawValue)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: LinkItem[] = []
  // Bound validation attempts too, including when every entry is invalid.
  for (const item of raw.slice(0, limit)) {
    const parsed = v.safeParse(LinkItemSchema, item)
    if (parsed.success) out.push(parsed.output)
  }
  return out
}

const isEmptyLink = (link: LinkItem) =>
  link.name.trim() === '' && link.url.trim() === ''

export const normalizeProfileLinks = (links: readonly LinkItem[]): LinkItem[] =>
  links.filter((link) => !isEmptyLink(link) && isSafeHttpUrl(link.url))

const normalizeProfileAddresses = (
  addresses: ProfileRecords['addresses'],
): ProfileRecords['addresses'] =>
  addresses.filter(({ value }) => value && value.trim() !== '')

const normalizeProfileTextRecords = (
  records: readonly TextRecordValue[],
): TextRecordValue[] =>
  records.map(({ key, value }) => ({
    key,
    value: getRecordDisplayValue(getRecordDef(key), value),
  }))

export const normalizeProfileRecords = (
  records: ProfileRecords,
): ProfileRecords => ({
  ...records,
  addresses: normalizeProfileAddresses(records.addresses),
  links: normalizeProfileLinks(records.links),
  social: normalizeProfileTextRecords(records.social),
})

interface TextRecordInput {
  readonly key: string
  readonly value: string
}

interface AddressRecordInput {
  readonly coinType: number
  readonly value: string
}

interface ServiceProfileRecords {
  readonly texts: TextRecordInput[]
  readonly coins: AddressRecordInput[]
  readonly contentHash?: string
  readonly abi?: string
}

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
    { key, value }: TextRecordInput,
  ): ProfileRecords => {
    // Agent-registration records (ENSIP-25) are matched by the fixed
    // `agent-registration` key prefix and routed to the agent transform.
    // Records that fail to parse fall through to the standard handling below.
    if (isAgentRegistrationKey(key)) {
      const agentRecord = transformAgentRegistrationRecord({ key, value })
      if (agentRecord) {
        return {
          ...acc,
          agentRegistrations: [...acc.agentRegistrations, agentRecord],
        }
      }
    }

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
      const links = parseLinksJson(value, MAX_PROFILE_LINKS - acc.links.length)
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

  const baseRecords = emptyProfileRecords()
  const withAddresses: ProfileRecords = {
    ...baseRecords,
    addresses: profile.coins,
    contentHash: profile.contentHash,
    abi: profile.abi,
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
): ServiceProfileRecords => {
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

  const links = normalizeProfileLinks(records.links)

  const linksText =
    links.length > 0 ? [{ key: 'links', value: JSON.stringify(links) }] : []

  const texts = [...sectionTexts, ...baseTexts, ...unknownTexts, ...linksText]

  const coins = records.addresses
    .filter(({ value }) => value && value.trim() !== '')
    .map(({ coinType, value }) => ({ coinType, value }))

  return { texts, coins, contentHash: records.contentHash, abi: records.abi }
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
export const debugProfileRecords = (
  records: ProfileRecords | undefined,
): void => {
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
