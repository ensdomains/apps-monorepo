import {
  InstagramIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  XIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AddressRecord, TextRecord } from '@/features/profile/types'

export const socialRecords: TextRecord[] = [
  {
    name: 'X (Twitter)',
    key: 'com.twitter',
    icon: <XIcon />,
  },
  {
    name: 'Telegram',
    key: 'com.telegram',
    icon: <span>T</span>,
  },
  {
    name: 'Instagram',
    key: 'com.instagram',
    icon: <InstagramIcon />,
  },
  {
    name: 'Discord',
    key: 'com.discord',
  },
  {
    name: 'GitHub',
    key: 'com.github',
  },
  {
    name: 'LinkedIn',
    key: 'com.linkedin',
  },
  {
    name: 'YouTube',
    key: 'com.youtube',
  },
  {
    name: 'Reddit',
    key: 'com.reddit',
  },
  {
    name: 'TikTok',
    key: 'com.tiktok',
  },
  {
    name: 'Twitch',
    key: 'com.twitch',
  },
  {
    name: 'Mastodon',
    key: 'com.mastodon',
  },
  {
    name: 'Bluesky',
    key: 'com.bluesky',
  },
]

export const contactRecords: TextRecord[] = [
  {
    name: 'Email Address',
    key: 'email',
    icon: <MailIcon />,
  },
  {
    name: 'Location',
    key: 'location',
    icon: <MapPinIcon />,
  },
  {
    name: 'Phone Number',
    key: 'phone',
    icon: <PhoneIcon />,
  },
  {
    name: 'Mailing Address',
    key: 'mail',
    icon: <MailIcon />,
  },
]

const chainIdToCoinType = (chainId: number) => (0x80000000 | chainId) >>> 0

export const addressRecords: AddressRecord[] = [
  {
    name: 'Ethereum',
    notation: 'ETH',
    coinType: 60,
  },
  {
    name: 'Bitcoin',
    notation: 'BTC',
    coinType: 0,
  },
  // Layer 2 Networks
  {
    name: 'Optimism',
    notation: 'OP',
    coinType: chainIdToCoinType(10),
  },
  {
    name: 'Arbitrum One',
    notation: 'ARB',
    coinType: chainIdToCoinType(42161),
  },
  {
    name: 'Polygon',
    notation: 'MATIC',
    coinType: chainIdToCoinType(137),
  },
  {
    name: 'Base',
    notation: 'ETH',
    coinType: chainIdToCoinType(8453),
  },
  {
    name: 'zkSync Era',
    notation: 'ETH',
    coinType: chainIdToCoinType(324),
  },
  {
    name: 'Linea',
    notation: 'ETH',
    coinType: chainIdToCoinType(59144),
  },
  {
    name: 'Scroll',
    notation: 'ETH',
    coinType: chainIdToCoinType(534352),
  },
  {
    name: 'Mantle',
    notation: 'MNT',
    coinType: chainIdToCoinType(5000),
  },
  {
    name: 'Polygon zkEVM',
    notation: 'ETH',
    coinType: chainIdToCoinType(1101),
  },
  // Other Popular Chains
  {
    name: 'BNB Smart Chain',
    notation: 'BNB',
    coinType: chainIdToCoinType(56),
  },
  {
    name: 'Avalanche C-Chain',
    notation: 'AVAX',
    coinType: chainIdToCoinType(43114),
  },
  {
    name: 'Fantom',
    notation: 'FTM',
    coinType: chainIdToCoinType(250),
  },
  {
    name: 'Celo',
    notation: 'CELO',
    coinType: chainIdToCoinType(42220),
  },
  {
    name: 'Gnosis Chain',
    notation: 'XDAI',
    coinType: chainIdToCoinType(100),
  },
]
