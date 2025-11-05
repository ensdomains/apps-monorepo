import type { Notification } from './types'

const now = Date.now()
const TIME = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const

const types = ['name-expiry', 'name-transferred', 'blog-post']
const names = [
  'vitalik.eth',
  'nick.eth',
  'erni.eth',
  'lizard.eth',
  'asdadadadadddddasdadasdadadadasdasdadasd.eth',
  '🥲🫣🤕😩🦞🐹🪿🦄🦋⛅️🥲🫣🤕😩🦞🐹🪿🦄🦋⛅️.eth',
  'erin.eth',
  'test.eth',
  'helgesson.eth',
  'noavatar.eth',
  'beau.eth',
  'jefflau.eth',
  'leontalbert.eth',
  'ucles.eth',
  '0xtestwallet.base.eth',
]

type PostData = {
  slug: string
  title: string
  cover: string
}

const posts: PostData[] = [
  {
    slug: 'd3-doma',
    title: 'Tokenized DNS Domains with Doma and ENS',
    cover:
      'https://6709d36e.ensdomains-v2.pages.dev/_next/static/media/cover-thumb.748d28f1.webp',
  },
  {
    slug: 'locker-domains',
    title: 'Orange Domains brings .locker domains to Ethereum with ENS',
    cover:
      'https://6709d36e.ensdomains-v2.pages.dev/_next/static/media/cover-thumb.bbc33b3d.webp',
  },
  {
    slug: 'l2-primary-names',
    title: 'How Primary Names Work Today & What L2 Primary Names Fix',
    cover:
      'https://6709d36e.ensdomains-v2.pages.dev/_next/static/media/cover-thumb.89fd1e07.webp',
  },
]

export const generateRandomNotification = (): Notification => {
  const type = types[Math.floor(Math.random() * types.length)]
  const name = names[Math.floor(Math.random() * names.length)] ?? 'default.eth'

  switch (type) {
    case 'name-expiry':
      return {
        type,
        name,
        expiryDate: now + Math.random() * 30 * TIME.DAY,
        timestamp: now - Math.random() * 60 * TIME.DAY,
        unread: Math.random() < 0.5,
      }
    case 'name-transferred':
      return {
        type,
        name,
        timestamp: now - Math.random() * 60 * TIME.DAY,
        txHash: '0x1234567890',
        to: '0x1234567890',
        unread: Math.random() < 0.5,
      }
    case 'blog-post': {
      const post = posts[Math.floor(Math.random() * posts.length)]!

      return {
        type,
        title: post.title,
        imageUrl: post.cover,
        url: `https://ens.domains/blog/post/${post.slug}`,
        timestamp: now - Math.random() * 60 * TIME.DAY,
        unread: Math.random() < 0.5,
      }
    }
    default:
      throw new Error(`Unknown notification type: ${type}`)
  }
}

export const MOCK_NOTIFICATIONS: Notification[] = Array.from({ length: 10 })
  .map(generateRandomNotification)
  .sort((a, b) => b.timestamp - a.timestamp)
