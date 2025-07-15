import {
  InstagramIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  XIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AddressRecord, TextRecord } from '@/features/profile/types'

// Define record definitions as objects for efficient key-based lookups
const socialRecordsMap: Record<string, TextRecord> = {
  'com.twitter': {
    name: 'X (Twitter)',
    key: 'com.twitter',
    icon: <XIcon />,
  },
  'com.telegram': {
    name: 'Telegram',
    key: 'com.telegram',
    icon: <span>T</span>,
  },
  'com.instagram': {
    name: 'Instagram',
    key: 'com.instagram',
    icon: <InstagramIcon />,
  },
  'com.discord': {
    name: 'Discord',
    key: 'com.discord',
  },
  'com.github': {
    name: 'GitHub',
    key: 'com.github',
  },
  'com.linkedin': {
    name: 'LinkedIn',
    key: 'com.linkedin',
  },
  'com.youtube': {
    name: 'YouTube',
    key: 'com.youtube',
  },
  'com.reddit': {
    name: 'Reddit',
    key: 'com.reddit',
  },
  'com.tiktok': {
    name: 'TikTok',
    key: 'com.tiktok',
  },
  'com.twitch': {
    name: 'Twitch',
    key: 'com.twitch',
  },
  'com.mastodon': {
    name: 'Mastodon',
    key: 'com.mastodon',
  },
  'com.bluesky': {
    name: 'Bluesky',
    key: 'com.bluesky',
  },
}

const contactRecordsMap: Record<string, TextRecord> = {
  email: {
    name: 'Email Address',
    key: 'email',
    icon: <MailIcon />,
  },
  location: {
    name: 'Location',
    key: 'location',
    icon: <MapPinIcon />,
  },
  phone: {
    name: 'Phone Number',
    key: 'phone',
    icon: <PhoneIcon />,
  },
  mail: {
    name: 'Mailing Address',
    key: 'mail',
    icon: <MailIcon />,
  },
}

const chainIdToCoinType = (chainId: number) => (0x80000000 | chainId) >>> 0

const addressRecordsMap: Record<number, AddressRecord> = {
  60: {
    name: 'Ethereum',
    notation: 'ETH',
    coinType: 60,
  },
  0: {
    name: 'Bitcoin',
    notation: 'BTC',
    coinType: 0,
  },
  // Layer 2 Networks
  [chainIdToCoinType(10)]: {
    name: 'Optimism',
    notation: 'OP',
    coinType: chainIdToCoinType(10),
  },
  [chainIdToCoinType(42161)]: {
    name: 'Arbitrum One',
    notation: 'ARB',
    coinType: chainIdToCoinType(42161),
  },
  [chainIdToCoinType(137)]: {
    name: 'Polygon',
    notation: 'MATIC',
    coinType: chainIdToCoinType(137),
  },
  [chainIdToCoinType(8453)]: {
    name: 'Base',
    notation: 'ETH',
    coinType: chainIdToCoinType(8453),
  },
  [chainIdToCoinType(324)]: {
    name: 'zkSync Era',
    notation: 'ETH',
    coinType: chainIdToCoinType(324),
  },
  [chainIdToCoinType(59144)]: {
    name: 'Linea',
    notation: 'ETH',
    coinType: chainIdToCoinType(59144),
  },
  [chainIdToCoinType(534352)]: {
    name: 'Scroll',
    notation: 'ETH',
    coinType: chainIdToCoinType(534352),
  },
  [chainIdToCoinType(5000)]: {
    name: 'Mantle',
    notation: 'MNT',
    coinType: chainIdToCoinType(5000),
  },
  [chainIdToCoinType(1101)]: {
    name: 'Polygon zkEVM',
    notation: 'ETH',
    coinType: chainIdToCoinType(1101),
  },
  // Other Popular Chains
  [chainIdToCoinType(56)]: {
    name: 'BNB Smart Chain',
    notation: 'BNB',
    coinType: chainIdToCoinType(56),
  },
  [chainIdToCoinType(43114)]: {
    name: 'Avalanche C-Chain',
    notation: 'AVAX',
    coinType: chainIdToCoinType(43114),
  },
  [chainIdToCoinType(250)]: {
    name: 'Fantom',
    notation: 'FTM',
    coinType: chainIdToCoinType(250),
  },
  [chainIdToCoinType(42220)]: {
    name: 'Celo',
    notation: 'CELO',
    coinType: chainIdToCoinType(42220),
  },
  [chainIdToCoinType(100)]: {
    name: 'Gnosis Chain',
    notation: 'XDAI',
    coinType: chainIdToCoinType(100),
  },
}

// Export arrays for backward compatibility and UI rendering
export const socialRecords: TextRecord[] = Object.values(socialRecordsMap)
export const contactRecords: TextRecord[] = Object.values(contactRecordsMap)
export const addressRecords: AddressRecord[] = Object.values(addressRecordsMap)

// Export maps for efficient lookups
export { socialRecordsMap, contactRecordsMap, addressRecordsMap }

// Helper functions for common operations
export const getSocialRecord = (key: string): TextRecord | undefined => {
  return socialRecordsMap[key]
}

export const getContactRecord = (key: string): TextRecord | undefined => {
  return contactRecordsMap[key]
}

export const getAddressRecord = (
  coinType: number,
): AddressRecord | undefined => {
  return addressRecordsMap[coinType]
}

export const isSocialRecord = (key: string): boolean => {
  return key in socialRecordsMap
}

export const isContactRecord = (key: string): boolean => {
  return key in contactRecordsMap
}

export const isAddressRecord = (coinType: number): boolean => {
  return coinType in addressRecordsMap
}

// Helper to get available records (not already used)
export const getAvailableSocialRecords = (usedKeys: string[]): TextRecord[] => {
  return socialRecords.filter((record) => !usedKeys.includes(record.key))
}

export const getAvailableContactRecords = (
  usedKeys: string[],
): TextRecord[] => {
  return contactRecords.filter((record) => !usedKeys.includes(record.key))
}

export const getAvailableAddressRecords = (
  usedCoinTypes: number[],
): AddressRecord[] => {
  return addressRecords.filter(
    (record) => !usedCoinTypes.includes(record.coinType),
  )
}
