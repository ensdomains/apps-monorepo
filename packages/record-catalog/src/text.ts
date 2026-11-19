export interface TextRecordOption {
  readonly key: string
  readonly name: string
}

export interface SocialProfileValueNormalization {
  readonly hosts: readonly string[]
  readonly pathPrefixes?: readonly string[]
}

type CopyPresentation = { readonly kind: 'copy' }

type SocialPresentation =
  | CopyPresentation
  | {
      readonly kind: 'link'
      readonly href: `https://${string}`
      readonly displayPrefix?: string
      readonly normalization?: SocialProfileValueNormalization
    }

type ContactPresentation =
  | { readonly format: 'text'; readonly presentation: CopyPresentation }
  | {
      readonly format: 'email'
      readonly presentation: { readonly kind: 'link'; readonly href: 'mailto:' }
    }
  | {
      readonly format: 'phone'
      readonly presentation: { readonly kind: 'link'; readonly href: 'tel:' }
    }

type DiscoverableTextRecord = TextRecordOption & {
  readonly searchAliases?: readonly string[]
  readonly icon: string
}

type TextRecordDefinition =
  | (DiscoverableTextRecord & {
      readonly role: 'profile'
      readonly format: 'text' | 'url' | 'image-url'
    })
  | (DiscoverableTextRecord & {
      readonly role: 'social'
      readonly format: 'handle'
      readonly presentation: SocialPresentation
    })
  | (DiscoverableTextRecord &
      ContactPresentation & { readonly role: 'contact' })
  | (TextRecordOption & {
      readonly role: 'internal'
      readonly format: 'text' | 'structured'
    })

export const PROFILE_TEXT_RECORDS = Object.freeze({
  avatar: {
    key: 'avatar',
    name: 'Avatar',
    role: 'profile',
    format: 'image-url',
    icon: 'circle-user-round',
    searchAliases: ['profile picture'],
  },
  header: {
    key: 'header',
    name: 'Header',
    role: 'profile',
    format: 'image-url',
    icon: 'image',
    searchAliases: ['banner', 'cover'],
  },
  name: {
    key: 'name',
    name: 'Nickname',
    role: 'profile',
    format: 'text',
    icon: 'user-round',
    searchAliases: ['display name'],
  },
  description: {
    key: 'description',
    name: 'Short Bio',
    role: 'profile',
    format: 'text',
    icon: 'align-left',
    searchAliases: ['biography'],
  },
  url: {
    key: 'url',
    name: 'Website',
    role: 'profile',
    format: 'url',
    icon: 'globe',
    searchAliases: ['homepage'],
  },
  theme: {
    key: 'theme',
    name: 'Theme',
    role: 'profile',
    format: 'text',
    icon: 'palette',
  },
  language: {
    key: 'language',
    name: 'Language',
    role: 'profile',
    format: 'text',
    icon: 'languages',
    searchAliases: ['locale'],
  },
  twitter: {
    key: 'com.twitter',
    name: 'X (Twitter)',
    role: 'social',
    format: 'handle',
    icon: 'x',
    presentation: {
      kind: 'link',
      href: 'https://x.com/',
      displayPrefix: '@',
      normalization: { hosts: ['x.com', 'twitter.com'] },
    },
  },
  telegram: {
    key: 'org.telegram',
    name: 'Telegram',
    role: 'social',
    format: 'handle',
    icon: 'telegram',
    presentation: {
      kind: 'link',
      href: 'https://t.me/',
      displayPrefix: '@',
      normalization: { hosts: ['t.me', 'telegram.me'] },
    },
  },
  farcaster: {
    key: 'xyz.farcaster',
    name: 'Farcaster',
    role: 'social',
    format: 'handle',
    icon: 'farcaster',
    presentation: {
      kind: 'link',
      href: 'https://farcaster.xyz/',
      displayPrefix: '@',
      normalization: { hosts: ['farcaster.xyz'] },
    },
  },
  instagram: {
    key: 'com.instagram',
    name: 'Instagram',
    role: 'social',
    format: 'handle',
    icon: 'instagram',
    presentation: {
      kind: 'link',
      href: 'https://instagram.com/',
      displayPrefix: '@',
      normalization: { hosts: ['instagram.com'] },
    },
  },
  discord: {
    key: 'com.discord',
    name: 'Discord',
    role: 'social',
    format: 'handle',
    icon: 'discord',
    presentation: { kind: 'copy' },
  },
  github: {
    key: 'com.github',
    name: 'GitHub',
    role: 'social',
    format: 'handle',
    icon: 'github',
    presentation: {
      kind: 'link',
      href: 'https://github.com/',
      normalization: { hosts: ['github.com'] },
    },
  },
  linkedin: {
    key: 'com.linkedin',
    name: 'LinkedIn',
    role: 'social',
    format: 'handle',
    icon: 'linkedin',
    presentation: {
      kind: 'link',
      href: 'https://www.linkedin.com/in/',
      normalization: { hosts: ['linkedin.com'], pathPrefixes: ['in'] },
    },
  },
  youtube: {
    key: 'com.youtube',
    name: 'YouTube',
    role: 'social',
    format: 'handle',
    icon: 'youtube',
    presentation: { kind: 'link', href: 'https://youtube.com/' },
  },
  reddit: {
    key: 'com.reddit',
    name: 'Reddit',
    role: 'social',
    format: 'handle',
    icon: 'reddit',
    presentation: {
      kind: 'link',
      href: 'https://reddit.com/user/',
      displayPrefix: 'u/',
      normalization: { hosts: ['reddit.com'], pathPrefixes: ['user'] },
    },
  },
  tiktok: {
    key: 'com.tiktok',
    name: 'TikTok',
    role: 'social',
    format: 'handle',
    icon: 'tiktok',
    presentation: {
      kind: 'link',
      href: 'https://www.tiktok.com/@',
      displayPrefix: '@',
      normalization: { hosts: ['tiktok.com'] },
    },
  },
  twitch: {
    key: 'com.twitch',
    name: 'Twitch',
    role: 'social',
    format: 'handle',
    icon: 'twitch',
    presentation: {
      kind: 'link',
      href: 'https://twitch.tv/',
      normalization: { hosts: ['twitch.tv'] },
    },
  },
  mastodon: {
    key: 'com.mastodon',
    name: 'Mastodon',
    role: 'social',
    format: 'handle',
    icon: 'mastodon',
    presentation: { kind: 'copy' },
  },
  email: {
    key: 'email',
    name: 'Email Address',
    role: 'contact',
    format: 'email',
    icon: 'mail',
    presentation: { kind: 'link', href: 'mailto:' },
  },
  location: {
    key: 'location',
    name: 'Location',
    role: 'contact',
    format: 'text',
    icon: 'map-pin',
    presentation: { kind: 'copy' },
  },
  phone: {
    key: 'phone',
    name: 'Phone Number',
    role: 'contact',
    format: 'phone',
    icon: 'phone',
    searchAliases: ['mobile'],
    presentation: { kind: 'link', href: 'tel:' },
  },
  mail: {
    key: 'mail',
    name: 'Mailing Address',
    role: 'contact',
    format: 'text',
    icon: 'house',
    presentation: { kind: 'copy' },
  },
  timezone: {
    key: 'timezone',
    name: 'Timezone',
    role: 'contact',
    format: 'text',
    icon: 'clock',
    searchAliases: ['time zone'],
    presentation: { kind: 'copy' },
  },
  links: {
    key: 'links',
    name: 'Links',
    role: 'internal',
    format: 'structured',
  },
  primaryContact: {
    key: 'primary-contact',
    name: 'Primary Contact',
    role: 'internal',
    format: 'text',
  },
  primaryContacts: {
    key: 'domains.ens.primary-contacts',
    name: 'Primary Contacts',
    role: 'internal',
    format: 'structured',
  },
} as const satisfies Readonly<Record<string, TextRecordDefinition>>)

export type TextRecordDescriptor =
  (typeof PROFILE_TEXT_RECORDS)[keyof typeof PROFILE_TEXT_RECORDS]

type DiscoverableTextRecordDescriptor = Exclude<
  TextRecordDescriptor,
  { readonly role: 'internal' }
>

export type TextRecordIconId = DiscoverableTextRecordDescriptor['icon']

export type ImageTextRecordKey = Extract<
  TextRecordDescriptor,
  { readonly format: 'image-url' }
>['key']

const TEXT_RECORD_INDEX = new Map<string, TextRecordDescriptor>(
  Object.values(PROFILE_TEXT_RECORDS).map((record) => [record.key, record]),
)

/** Looks up an exact resolver key, preserving the distinction between raw keys and search aliases. */
export function getTextRecordDescriptor(
  key: string,
): TextRecordDescriptor | undefined {
  return TEXT_RECORD_INDEX.get(key)
}

const TEXT_RECORD_OPTIONS = Object.values(PROFILE_TEXT_RECORDS)
  .filter((record) => record.role !== 'internal')
  .map((record) => ({
    option: Object.freeze({ key: record.key, name: record.name }),
    searchAliases: 'searchAliases' in record ? record.searchAliases : [],
  }))

export function searchTextRecords(query: string): readonly TextRecordOption[] {
  const search = query.trim().toLowerCase()
  return TEXT_RECORD_OPTIONS.filter(
    ({ option: { key, name }, searchAliases }) =>
      key.toLowerCase().includes(search) ||
      name.toLowerCase().includes(search) ||
      searchAliases.some((alias) => alias === search),
  ).map(({ option }) => option)
}
