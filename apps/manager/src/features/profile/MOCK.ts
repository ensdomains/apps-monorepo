import { isContactRecord, isSocialRecord } from './data/records'

import type { ProfileRecords, ProfileRecordsResult } from './types'

export const getProfileRecords = (name: string): ProfileRecordsResult => {
  return {
    texts: {
      avatar: 'https://enstate.rs/i/helgesson.eth',
      header: 'https://ens.domains/og-image.png',
      'com.twitter': 'https://x.com/helgesson_',
      'com.github': 'https://github.com/svemat01',
      'com.telegram': 'https://t.me/helgesson',
      links: JSON.stringify([
        {
          name: 'Recent Projects',
          url: 'https://projects.helgesson.dev',
        },
        {
          name: 'Blog',
          url: 'https://blog.helgesson.dev',
        },
        {
          name: 'Resume',
          url: 'https://resume.helgesson.dev',
        },
      ]),
    },
    addresses: {
      60: '0x0000000000000000000000000000000000000000',
      0: '0x0000000000000000000000000000000000000000',
    },
  }
}

export const transformProfileRecords = (
  profile: ProfileRecordsResult,
): ProfileRecords => {
  const texts = Object.entries(profile.texts).map(([key, value]) => ({
    key,
    value,
  }))
  const addresses = Object.entries(profile.addresses).map(
    ([coinType, value]) => ({
      coinType: parseInt(coinType, 10),
      value,
    }),
  )
  const links: { name: string; url: string }[] = profile.texts.links
    ? JSON.parse(profile.texts.links)
    : []

  return {
    bio: {
      avatar: profile.texts.avatar,
      header: profile.texts.header,
      description: profile.texts.description,
    },
    social: texts.filter(({ key }) => isSocialRecord(key)),
    contacts: texts.filter(({ key }) => isContactRecord(key)),
    addresses,
    links,
  }
}
