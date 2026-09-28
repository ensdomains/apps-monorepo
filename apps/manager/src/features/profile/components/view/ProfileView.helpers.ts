import { isEvmCoinType } from '@ensdomains/address-encoder/utils'
import {
  getAddressRecordDef,
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '@/features/profile/data/records'
import type {
  AddressRecordValue,
  LinkItem,
  ProfileRecords,
  TextRecordValue,
} from '@/features/profile/types'
import { MAX_PROFILE_LINKS } from '@/features/profile/utils/linkLimits'
import { safeHttpHref } from '@/features/profile/utils/safeUrl'
import { getPrimarySocialContactKeys } from '../dialogs/edit-profile/tabs/contact/records'

const ETH_COIN_TYPE = 60
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i
const DOMAIN_LIKE_URL = /^[\w.-]+\.[a-z]{2,}(?:[/#?].*)?$/i
const PROFILE_HEADER_ONLY_RECORD_KEYS: ReadonlySet<string> = new Set([
  'location',
  'timezone',
])
const COMPACT_MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const
const FULL_MONTH_LABELS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const

type ProfileDetailDateVariant = 'mobile' | 'desktop'

export type ProfileContactItem = {
  readonly key: string
  readonly label: string
  readonly displayPrefix?: string
  readonly displayValue: string
  readonly href?: string
  readonly icon?: NonNullable<ReturnType<typeof getRecordDef>>['icon']
}

export type SafeProfileLink = LinkItem & {
  readonly href: string
  readonly displayHost: string
}

export type ProfileAddressItem = AddressRecordValue & {
  readonly label: string
  readonly notation: string
  readonly icon?: NonNullable<ReturnType<typeof getAddressRecordDef>>['icon']
}

type IndexedProfileAddressItem = ProfileAddressItem & {
  readonly sourceIndex: number
}

const CHAIN_SPECIFIC_ADDRESS_EDGE_LENGTH = 5

export const formatChainSpecificAddress = (value: string): string => {
  const trimmed = value.trim()

  if (trimmed.length <= CHAIN_SPECIFIC_ADDRESS_EDGE_LENGTH * 2) return trimmed

  return `${trimmed.slice(0, CHAIN_SPECIFIC_ADDRESS_EDGE_LENGTH)}...${trimmed.slice(-CHAIN_SPECIFIC_ADDRESS_EDGE_LENGTH)}`
}

/**
 * The profile page is server-rendered, and the server can't know the viewer's
 * timezone — so dates are formatted in UTC during SSR/first paint (deterministic,
 * no hydration mismatch) and re-rendered in the viewer's local timezone once
 * hydrated. Callers pass `timeZone: 'local'` after `useHydrated()` flips true.
 * Local is the app-wide convention (dashboard, registration, and renewal all use
 * it); UTC here is only the SSR default.
 */
export const formatProfileDetailDate = (
  date: Date | null | undefined,
  variant: ProfileDetailDateVariant = 'mobile',
  timeZone: 'utc' | 'local' = 'utc',
) => {
  if (!date || Number.isNaN(date.getTime())) return undefined

  const [monthIndex, dayOfMonth, fullYear] =
    timeZone === 'local'
      ? [date.getMonth(), date.getDate(), date.getFullYear()]
      : [date.getUTCMonth(), date.getUTCDate(), date.getUTCFullYear()]
  const compactMonth = COMPACT_MONTH_LABELS[monthIndex]
  const fullMonth = FULL_MONTH_LABELS[monthIndex]
  if (!compactMonth || !fullMonth) return undefined

  if (variant === 'desktop') {
    return `${fullMonth} ${dayOfMonth}, ${fullYear}`
  }

  const day = String(dayOfMonth).padStart(2, '0')
  return `${compactMonth}.${day}.${fullYear}`
}

const toSafeHttpHref = (value: string): string | undefined => {
  const strictHref = safeHttpHref(value)
  if (strictHref) return strictHref

  const trimmed = value.trim()
  if (!DOMAIN_LIKE_URL.test(trimmed)) return undefined

  return safeHttpHref(`https://${trimmed}`)
}

export const getSafeProfileHref = toSafeHttpHref

export const getDisplayHost = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

export const getSafeProfileLinks = (
  records: ProfileRecords,
): SafeProfileLink[] =>
  records.links.slice(0, MAX_PROFILE_LINKS).flatMap((link) => {
    const href = toSafeHttpHref(link.url)
    return href ? [{ ...link, href, displayHost: getDisplayHost(href) }] : []
  })

const getRecordByKey = (
  records: readonly TextRecordValue[],
  key: string,
): TextRecordValue | undefined =>
  records.find((record) => record.key === key && record.value.trim() !== '')

const toContactItem = (
  record: TextRecordValue,
): ProfileContactItem | undefined => {
  if (PROFILE_HEADER_ONLY_RECORD_KEYS.has(record.key)) return undefined

  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value)

  if (!displayValue.trim()) return undefined

  const href = getRecordHref(recordDef, displayValue)

  return {
    key: record.key,
    label: recordDef?.name ?? record.key,
    displayPrefix: recordDef?.displayPrefix,
    displayValue,
    href,
    icon: recordDef?.icon,
  }
}

export const getContactItems = (
  records: ProfileRecords,
): ProfileContactItem[] =>
  records.contact.flatMap((record) => {
    const item = toContactItem(record)
    return item ? [item] : []
  })

export const getFeaturedSocialItems = (
  records: ProfileRecords,
): ProfileContactItem[] =>
  getPrimarySocialContactKeys(records.base).flatMap((key) => {
    const record = getRecordByKey(records.social, key)
    if (!record) return []

    const item = toContactItem(record)
    return item ? [item] : []
  })

export const getSecondarySocialRecords = (
  records: ProfileRecords,
): TextRecordValue[] => {
  const primaryContactKeys = new Set<string>(
    getPrimarySocialContactKeys(records.base),
  )

  return records.social.filter(
    (record) =>
      record.value.trim() !== '' && !primaryContactKeys.has(record.key),
  )
}

const toAddressItem = (
  address: AddressRecordValue,
  sourceIndex: number,
): IndexedProfileAddressItem | undefined => {
  const value = address.value.trim()
  if (!value) return undefined

  const recordDef = getAddressRecordDef(address.coinType)
  const notation = (recordDef?.notation ?? `#${address.coinType}`).toUpperCase()

  return {
    ...address,
    value,
    sourceIndex,
    label: recordDef?.name ?? notation,
    notation,
    icon: recordDef?.icon,
  }
}

const omitSourceIndex = ({
  sourceIndex: _sourceIndex,
  ...address
}: IndexedProfileAddressItem): ProfileAddressItem => address

const getAddressItems = (
  records: ProfileRecords,
): IndexedProfileAddressItem[] =>
  records.addresses.flatMap((address, index) => {
    const item = toAddressItem(address, index)
    return item ? [item] : []
  })

const getMainAddressCandidate = (
  records: ProfileRecords,
): IndexedProfileAddressItem | undefined => {
  const addresses = getAddressItems(records)
  return (
    addresses.find((address) => address.coinType === ETH_COIN_TYPE) ??
    addresses[0]
  )
}

export const getMainReceivingAddress = (
  records: ProfileRecords,
): ProfileAddressItem | undefined => {
  const address = getMainAddressCandidate(records)
  return address ? omitSourceIndex(address) : undefined
}

const sharesReceivingAddress = (
  address: ProfileAddressItem,
  mainAddress: ProfileAddressItem,
): boolean => {
  const isEvmAddress = (item: ProfileAddressItem): boolean =>
    (item.coinType === ETH_COIN_TYPE || isEvmCoinType(item.coinType)) &&
    EVM_ADDRESS.test(item.value)

  if (isEvmAddress(address) && isEvmAddress(mainAddress)) {
    return address.value.toLowerCase() === mainAddress.value.toLowerCase()
  }

  // Other coin types have independent address formats, including case-sensitive
  // Base58. Keep their icons and copy values attached to their own records.
  return (
    address.coinType === mainAddress.coinType &&
    address.value === mainAddress.value
  )
}

/**
 * Show the main record's icon and compatible EVM records sharing its address.
 */
export const getReceivingAddressChains = (
  records: ProfileRecords,
): ProfileAddressItem[] => {
  const mainAddress = getMainAddressCandidate(records)
  if (!mainAddress) return []

  return getAddressItems(records)
    .filter((address) => sharesReceivingAddress(address, mainAddress))
    .map(omitSourceIndex)
}

/**
 * Keep records outside the main address's compatible group on their own cards.
 */
export const getChainSpecificAddresses = (
  records: ProfileRecords,
): ProfileAddressItem[] => {
  const mainAddress = getMainAddressCandidate(records)

  return getAddressItems(records)
    .filter(
      (address) =>
        !mainAddress || !sharesReceivingAddress(address, mainAddress),
    )
    .map(omitSourceIndex)
}
