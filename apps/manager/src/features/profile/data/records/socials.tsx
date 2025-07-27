import type { RecordDefinition } from '../../types'

export const socialRecords: RecordDefinition[] = [
  {
    key: 'com.twitter',
    name: 'X (Twitter)',
    displayPrefix: '@',
    hrefBase: 'https://x.com/',
  },
  {
    key: 'com.telegram',
    name: 'Telegram',
    displayPrefix: '@',
    hrefBase: 'https://t.me/',
  },
  {
    key: 'com.instagram',
    name: 'Instagram',
    displayPrefix: '@',
  },
  {
    key: 'com.discord',
    name: 'Discord',
  },
  {
    key: 'com.github',
    name: 'GitHub',
  },
  {
    key: 'com.linkedin',
    name: 'LinkedIn',
    hrefBase: 'https://www.linkedin.com/in/',
  },
  {
    key: 'com.youtube',
    name: 'YouTube',
  },
  {
    key: 'com.reddit',
    name: 'Reddit',
    displayPrefix: 'u/',
  },
  {
    key: 'com.tiktok',
    name: 'TikTok',
    displayPrefix: '@',
  },
  {
    key: 'com.twitch',
    name: 'Twitch',
  },
  {
    key: 'com.mastodon',
    name: 'Mastodon',
  },
] as const satisfies [RecordDefinition, ...RecordDefinition[]]
