import {
  ETH_COIN_TYPE,
  evmChainOptions,
  otherNetworkOptions,
} from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/addressPickerRecords'
import { addressRecords } from '@/features/profile/data/records'

export type ProfileSection =
  | 'general'
  | 'contact'
  | 'addresses'
  | 'links'
  | 'appearance'

/** Only records with an existing editable Manager control belong here. */
export const PROFILE_FIELD_DEFINITIONS = [
  {
    field: 'description',
    label: 'Description',
    section: 'general',
    storage: 'base',
    key: 'description',
    pattern: /\b(?:description|bio|about[- ]me)\b/i,
  },
  {
    field: 'avatar',
    label: 'Avatar',
    section: 'general',
    storage: 'base',
    key: 'avatar',
    pattern: /\b(?:avatar|profile\s+(?:picture|photo))\b/i,
  },
  {
    field: 'header',
    label: 'Banner image',
    section: 'general',
    storage: 'base',
    key: 'header',
    pattern: /\b(?:banner|header|cover\s+(?:photo|image))\b/i,
  },
  {
    field: 'display_name',
    label: 'Full name',
    section: 'general',
    storage: 'base',
    key: 'name',
    pattern: /\b(?:full\s+name|display\s+name|real\s+name|profile\s+name)\b/i,
  },
  {
    field: 'website',
    label: 'Website URL',
    section: 'general',
    storage: 'base',
    key: 'url',
    pattern: /\b(?:website|homepage|custom\s+url)\b/i,
  },
  {
    field: 'location',
    label: 'Location',
    section: 'general',
    storage: 'contact',
    key: 'location',
    pattern: /\b(?:location|city)\b/i,
  },
  {
    field: 'timezone',
    label: 'Timezone',
    section: 'general',
    storage: 'contact',
    key: 'timezone',
    pattern: /\btime\s*zone\b/i,
  },
  {
    field: 'language',
    label: 'Profile language',
    section: 'general',
    storage: 'base',
    key: 'language',
    pattern: /\blanguage\b/i,
  },
  {
    field: 'email',
    label: 'Contact email',
    section: 'contact',
    storage: 'contact',
    key: 'email',
    pattern: /\b(?:email|e-mail)\b/i,
  },
  {
    field: 'phone',
    label: 'Phone number',
    section: 'contact',
    storage: 'contact',
    key: 'phone',
    pattern: /\b(?:phone|telephone|mobile\s+number)\b/i,
  },
  {
    field: 'postal_address',
    label: 'Mailing address',
    section: 'contact',
    storage: 'contact',
    key: 'mail',
    pattern: /\b(?:mailing|postal|street|home)\s+address\b/i,
  },
  {
    field: 'twitter',
    label: 'X (Twitter)',
    section: 'contact',
    storage: 'social',
    key: 'com.twitter',
    // Instruction matching only: callers mask literal values and name targets.
    pattern:
      /\b(?:twitter|twiter|twtter|x\s+(?:username|handle|account|profile))\b/i,
  },
  {
    field: 'telegram',
    label: 'Telegram',
    section: 'contact',
    storage: 'social',
    key: 'org.telegram',
    pattern: /\btelegram\b/i,
  },
  {
    field: 'farcaster',
    label: 'Farcaster',
    section: 'contact',
    storage: 'social',
    key: 'xyz.farcaster',
    pattern: /\bfarcaster\b/i,
  },
  {
    field: 'discord',
    label: 'Discord',
    section: 'contact',
    storage: 'social',
    key: 'com.discord',
    pattern: /\bdiscord\b/i,
  },
  {
    field: 'instagram',
    label: 'Instagram',
    section: 'contact',
    storage: 'social',
    key: 'com.instagram',
    pattern: /\binstagram\b/i,
  },
  {
    field: 'linkedin',
    label: 'LinkedIn',
    section: 'contact',
    storage: 'social',
    key: 'com.linkedin',
    pattern: /\blinkedin\b/i,
  },
  {
    field: 'github',
    label: 'GitHub username',
    section: 'contact',
    storage: 'social',
    key: 'com.github',
    pattern: /\bgithub\b/i,
  },
  {
    field: 'mastodon',
    label: 'Mastodon',
    section: 'contact',
    storage: 'social',
    key: 'com.mastodon',
    pattern: /\bmastodon\b/i,
  },
  {
    field: 'reddit',
    label: 'Reddit',
    section: 'contact',
    storage: 'social',
    key: 'com.reddit',
    pattern: /\breddit\b/i,
  },
  {
    field: 'tiktok',
    label: 'TikTok',
    section: 'contact',
    storage: 'social',
    key: 'com.tiktok',
    pattern: /\btik\s*tok\b/i,
  },
  {
    field: 'twitch',
    label: 'Twitch',
    section: 'contact',
    storage: 'social',
    key: 'com.twitch',
    pattern: /\btwitch\b/i,
  },
  {
    field: 'theme',
    label: 'Theme',
    section: 'appearance',
    storage: 'base',
    key: 'theme',
    pattern: /\b(?:themes?|appearance)\b/i,
  },
] as const

export type ProfileTextField =
  (typeof PROFILE_FIELD_DEFINITIONS)[number]['field']
export type ProfileField = ProfileTextField | 'eth_address' | 'address' | 'link'
export type ProfileOperation =
  | 'set'
  | 'remove'
  | 'feature'
  | 'unfeature'
  | 'use_eth'
  | 'rename'

export const getProfileFieldDefinition = (field: ProfileField) =>
  PROFILE_FIELD_DEFINITIONS.find((definition) => definition.field === field)

export const profileFieldOptions = [
  ...PROFILE_FIELD_DEFINITIONS.map(({ field, label }) => ({
    value: field,
    label,
  })),
  { value: 'eth_address', label: 'Ethereum address' },
  { value: 'address', label: 'Other network address' },
  { value: 'link', label: 'Named link' },
] as const

export const profileNetworkOptions = addressRecords.map(
  ({ coinType, name, notation }) => ({
    value: String(coinType),
    label: notation ? `${name} (${notation})` : name,
  }),
)

export const getProfileNetwork = (coinType: number | undefined) =>
  addressRecords.find((record) => record.coinType === coinType)

const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Coin types come from the deployed editor catalog, never model-generated numbers. */
export const findProfileNetworks = (instruction: string) => {
  const withoutNames = instruction.replace(/\S*[.@]\S*/g, '')
  const nativeOptions = [...evmChainOptions, ...otherNetworkOptions]
  const matches = addressRecords.filter(({ coinType, name, notation }) => {
    if (coinType === ETH_COIN_TYPE) return false
    const configured = nativeOptions.find(
      (option) => option.coinType === coinType,
    )
    const aliases = [name, configured?.label, notation].filter(
      (alias): alias is string => !!alias && alias.length > 2,
    )
    return aliases.some((alias) =>
      new RegExp(`\\b${escapePattern(alias)}\\b`, 'i').test(withoutNames),
    )
  })
  // A short token such as SOL is still a chain only in an address request.
  return matches.filter(
    (record, index) =>
      matches.findIndex(({ coinType }) => coinType === record.coinType) ===
      index,
  )
}
