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

const postSlugs = await fetch('https://ens.domains/blog/search.json')
  // biome-ignore lint/suspicious/noExplicitAny: Quick mock
  .then((res) => res.json() as any)
  .then((data) => data.map((post: { slug: string }) => post.slug))

const getPostMetadata = async (slug: string) => {
  const post = await fetch(
    `https://ens.domains/blog/post/${slug}/metadata.json`,
  ).then((res) => res.json())
  return post as {
    slug: string
    title: string

    assets: {
      post: {
        'cover-thumb'?: {
          src: string
        }
        cover?: {
          src: string
        }
      }
    }
  }
}

type PostData = {
  slug: string
  title: string
  cover: string
}

const postCache: Record<string, PostData> = {}

const getRandomPost = async () => {
  const slug = postSlugs[Math.floor(Math.random() * postSlugs.length)]
  if (!postCache[slug]) {
    const post = await getPostMetadata(slug)
    postCache[slug] = {
      slug,
      title: post.title,
      cover: `https://ens.domains${post.assets?.post?.['cover-thumb']?.src || post.assets?.post?.cover?.src}`,
    }
  }
  return postCache[slug]
}

export const generateRandomNotification = async (): Promise<Notification> => {
  const type = types[Math.floor(Math.random() * types.length)]
  const name = names[Math.floor(Math.random() * names.length)]

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
      const post = await getRandomPost()
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

export const MOCK_NOTIFICATIONS: Notification[] = (
  await Promise.all(Array.from({ length: 10 }).map(generateRandomNotification))
).sort((a, b) => b.timestamp - a.timestamp)
