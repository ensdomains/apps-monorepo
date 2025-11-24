import {
  ClockIcon,
  HouseIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
} from 'lucide-react'
import type { SectionData, TextRecordDef } from './types'

export const specialSections = ['contact'] as const

export const sections = {
  social: { label: 'Connect', description: 'Social media usernames' },
} as const satisfies Record<string, SectionData>

export const staticTextRecords = [
  'avatar',
  'header',
  'description',
  'url',
] as const

export const textRecords: TextRecordDef[] = [
  // Social
  {
    key: 'com.twitter',
    section: 'social',
    name: 'X (Twitter)',
    displayPrefix: '@',
    href: 'https://x.com/',
    kind: 'link',
    forceFetch: 'always',
  },
  {
    key: 'org.telegram',
    section: 'social',
    name: 'Telegram',
    displayPrefix: '@',
    href: 'https://t.me/',
    kind: 'link',
    forceFetch: 'always',
  },
  {
    key: 'xyz.farcaster',
    section: 'social',
    name: 'Farcaster',
    displayPrefix: '@',
    href: 'https://farcaster.xyz/',
    kind: 'link',
    forceFetch: 'always',
  },
  {
    key: 'com.instagram',
    section: 'social',
    name: 'Instagram',
    displayPrefix: '@',
    kind: 'link',
    href: 'https://instagram.com/',
  },
  {
    key: 'com.discord',
    section: 'social',
    name: 'Discord',
    kind: 'copy',
    forceFetch: 'always',
  },
  {
    key: 'com.github',
    section: 'social',
    name: 'GitHub',
    kind: 'link',
    href: 'https://github.com/',
    forceFetch: 'always',
  },
  {
    key: 'com.linkedin',
    section: 'social',
    name: 'LinkedIn',
    href: 'https://www.linkedin.com/in/',
    kind: 'link',
  },
  {
    key: 'com.youtube',
    section: 'social',
    name: 'YouTube',
    kind: 'link',
    href: 'https://youtube.com/',
  },
  {
    key: 'com.reddit',
    section: 'social',
    name: 'Reddit',
    displayPrefix: 'u/',
    kind: 'link',
    href: 'https://reddit.com/user/',
  },
  {
    key: 'com.tiktok',
    section: 'social',
    name: 'TikTok',
    displayPrefix: '@',
    kind: 'link',
    href: 'https://www.tiktok.com/@',
  },
  {
    key: 'com.twitch',
    section: 'social',
    name: 'Twitch',
    kind: 'link',
    href: 'https://twitch.tv/',
  },
  { key: 'com.mastodon', section: 'social', name: 'Mastodon', kind: 'copy' },

  // Contact
  {
    key: 'email',
    section: 'contact',
    name: 'Email Address',
    description: 'Your email address',
    kind: 'link',
    href: 'mailto:',
    forceFetch: 'always',
    icon: MailIcon,
  },
  {
    key: 'location',
    section: 'contact',
    name: 'Location',
    description: 'Your location',
    kind: 'copy',
    icon: MapPinIcon,
  },
  {
    key: 'phone',
    section: 'contact',
    name: 'Phone Number',
    description: 'Your phone number',
    kind: 'link',
    href: 'tel:',
    forceFetch: 'always',
    icon: PhoneIcon,
  },
  {
    key: 'mail',
    section: 'contact',
    name: 'Mailing Address',
    description: 'Your mailing address',
    kind: 'copy',
    icon: HouseIcon,
  },
  {
    key: 'timezone',
    section: 'contact',
    name: 'Timezone',
    description: 'Your timezone',
    kind: 'copy',
    icon: ClockIcon,
  },
]
