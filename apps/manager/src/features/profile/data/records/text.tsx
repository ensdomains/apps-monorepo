import { PROFILE_TEXT_RECORDS } from '@ens-apps/record-catalog'
import {
  SiDiscord,
  SiFarcaster,
  SiGithub,
  SiInstagram,
  SiMastodon,
  SiReddit,
  SiTelegram,
  SiTiktok,
  SiTwitch,
  SiX,
  SiYoutube,
} from '@icons-pack/react-simple-icons'
import {
  ClockIcon,
  HouseIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
} from 'lucide-react'
import { LinkedInIcon } from '../../components/icons/LinkedInIcon'
import { createSocialProfileValueNormalizer } from './social'
import type { SectionData, TextRecordDef } from './types'

export const specialSections = ['contact'] as const

export const sections = {
  social: { label: 'Connect' },
} as const satisfies Record<string, SectionData>

export const staticTextRecords = [
  PROFILE_TEXT_RECORDS.name.key,
  PROFILE_TEXT_RECORDS.avatar.key,
  PROFILE_TEXT_RECORDS.header.key,
  PROFILE_TEXT_RECORDS.description.key,
  PROFILE_TEXT_RECORDS.url.key,
  PROFILE_TEXT_RECORDS.theme.key,
  PROFILE_TEXT_RECORDS.language.key,
  PROFILE_TEXT_RECORDS.primaryContact.key,
  PROFILE_TEXT_RECORDS.primaryContacts.key,
] as const

export const textRecords: TextRecordDef[] = [
  // Social
  {
    ...PROFILE_TEXT_RECORDS.twitter,
    section: 'social',
    displayPrefix: '@',
    href: 'https://x.com/',
    kind: 'link',
    forceFetch: 'always',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['x.com', 'twitter.com'],
    }),
    icon: SiX,
  },
  {
    ...PROFILE_TEXT_RECORDS.telegram,
    section: 'social',
    displayPrefix: '@',
    href: 'https://t.me/',
    kind: 'link',
    forceFetch: 'always',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['t.me', 'telegram.me'],
    }),
    icon: SiTelegram,
  },
  {
    ...PROFILE_TEXT_RECORDS.farcaster,
    section: 'social',
    displayPrefix: '@',
    href: 'https://farcaster.xyz/',
    kind: 'link',
    forceFetch: 'always',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['farcaster.xyz'],
    }),
    icon: SiFarcaster,
  },
  {
    ...PROFILE_TEXT_RECORDS.instagram,
    section: 'social',
    displayPrefix: '@',
    kind: 'link',
    href: 'https://instagram.com/',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['instagram.com'],
    }),
    icon: SiInstagram,
  },
  {
    ...PROFILE_TEXT_RECORDS.discord,
    section: 'social',
    kind: 'copy',
    forceFetch: 'always',
    icon: SiDiscord,
  },
  {
    ...PROFILE_TEXT_RECORDS.github,
    section: 'social',
    kind: 'link',
    href: 'https://github.com/',
    forceFetch: 'always',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['github.com'],
    }),
    icon: SiGithub,
  },
  {
    ...PROFILE_TEXT_RECORDS.linkedin,
    section: 'social',
    href: 'https://www.linkedin.com/in/',
    kind: 'link',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['linkedin.com'],
      pathPrefixes: ['in'],
    }),
    icon: LinkedInIcon,
  },
  {
    ...PROFILE_TEXT_RECORDS.youtube,
    section: 'social',
    kind: 'link',
    href: 'https://youtube.com/',
    icon: SiYoutube,
  },
  {
    ...PROFILE_TEXT_RECORDS.reddit,
    section: 'social',
    displayPrefix: 'u/',
    kind: 'link',
    href: 'https://reddit.com/user/',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['reddit.com'],
      pathPrefixes: ['user'],
    }),
    icon: SiReddit,
  },
  {
    ...PROFILE_TEXT_RECORDS.tiktok,
    section: 'social',
    displayPrefix: '@',
    kind: 'link',
    href: 'https://www.tiktok.com/@',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['tiktok.com'],
    }),
    icon: SiTiktok,
  },
  {
    ...PROFILE_TEXT_RECORDS.twitch,
    section: 'social',
    kind: 'link',
    href: 'https://twitch.tv/',
    normalize: createSocialProfileValueNormalizer({
      hosts: ['twitch.tv'],
    }),
    icon: SiTwitch,
  },
  {
    ...PROFILE_TEXT_RECORDS.mastodon,
    section: 'social',
    kind: 'copy',
    icon: SiMastodon,
  },

  // Contact
  {
    ...PROFILE_TEXT_RECORDS.email,
    section: 'contact',
    kind: 'link',
    href: 'mailto:',
    forceFetch: 'always',
    icon: MailIcon,
  },
  {
    ...PROFILE_TEXT_RECORDS.location,
    section: 'contact',
    kind: 'copy',
    icon: MapPinIcon,
  },
  {
    ...PROFILE_TEXT_RECORDS.phone,
    section: 'contact',
    kind: 'link',
    href: 'tel:',
    forceFetch: 'always',
    icon: PhoneIcon,
  },
  {
    ...PROFILE_TEXT_RECORDS.mail,
    section: 'contact',
    kind: 'copy',
    icon: HouseIcon,
  },
  {
    ...PROFILE_TEXT_RECORDS.timezone,
    section: 'contact',
    kind: 'copy',
    icon: ClockIcon,
  },
]
