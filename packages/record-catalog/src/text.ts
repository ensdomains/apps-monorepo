export interface TextRecordOption {
  readonly key: string
  readonly name: string
}

function textRecord<Key extends string>(key: Key, name: string) {
  return Object.freeze({ key, name })
}

const DISCOVERABLE_TEXT_RECORDS = Object.freeze({
  avatar: textRecord('avatar', 'Avatar'),
  header: textRecord('header', 'Header'),
  name: textRecord('name', 'Nickname'),
  description: textRecord('description', 'Short Bio'),
  url: textRecord('url', 'Website'),
  theme: textRecord('theme', 'Theme'),
  language: textRecord('language', 'Language'),
  twitter: textRecord('com.twitter', 'X (Twitter)'),
  telegram: textRecord('org.telegram', 'Telegram'),
  farcaster: textRecord('xyz.farcaster', 'Farcaster'),
  instagram: textRecord('com.instagram', 'Instagram'),
  discord: textRecord('com.discord', 'Discord'),
  github: textRecord('com.github', 'GitHub'),
  linkedin: textRecord('com.linkedin', 'LinkedIn'),
  youtube: textRecord('com.youtube', 'YouTube'),
  reddit: textRecord('com.reddit', 'Reddit'),
  tiktok: textRecord('com.tiktok', 'TikTok'),
  twitch: textRecord('com.twitch', 'Twitch'),
  mastodon: textRecord('com.mastodon', 'Mastodon'),
  email: textRecord('email', 'Email Address'),
  location: textRecord('location', 'Location'),
  phone: textRecord('phone', 'Phone Number'),
  mail: textRecord('mail', 'Mailing Address'),
  timezone: textRecord('timezone', 'Timezone'),
})

export const PROFILE_TEXT_RECORDS = Object.freeze({
  ...DISCOVERABLE_TEXT_RECORDS,
  links: textRecord('links', 'Links'),
  primaryContact: textRecord('primary-contact', 'Primary Contact'),
  primaryContacts: textRecord(
    'domains.ens.primary-contacts',
    'Primary Contacts',
  ),
})

const TEXT_RECORD_OPTIONS = Object.values(DISCOVERABLE_TEXT_RECORDS)

export function searchTextRecords(query: string): readonly TextRecordOption[] {
  const search = query.trim().toLowerCase()
  return TEXT_RECORD_OPTIONS.filter(
    ({ key, name }) =>
      key.toLowerCase().includes(search) || name.toLowerCase().includes(search),
  )
}
