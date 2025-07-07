import type { Notification } from './types'

const now = Date.now()
const TIME = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const

export const MOCK_NOTIFICATIONS: Notification[] = [
  // erni.eth, transferred, received 2 hours ago
  // lizard.eth, expires in 30 days, received 3 days ago
  // asdadadadadddddasdadasdadadadasdasdadasd.eth, expires in 7 days, received 4 days ago
  // 😢🥲🫣🤕😩🦞🐹🪿🦄🦋⛅️🥲🫣🤕😩🦞🐹🪿🦄🦋⛅️.eth, expires in 30 days, received 29 days ago
  // erin.eth, expires in 30 days, received 60 days ago
  {
    type: 'name-transferred',
    name: 'erni.eth',
    txHash: '0x1234567890',
    to: '0x1234567890',
    timestamp: now - 2 * TIME.HOUR,
    unread: true,
  },
  {
    type: 'name-expiry',
    name: 'lizard.eth',
    expiryDate: now + 30 * TIME.DAY,
    timestamp: now - 3 * TIME.DAY,
  },
  {
    type: 'name-expiry',
    name: 'asdadadadadddddasdadasdadadadasdasdadasd.eth',
    expiryDate: now + 7 * TIME.DAY,
    timestamp: now - 4 * TIME.DAY,
  },
  {
    type: 'name-expiry',
    name: '🥲🫣🤕😩🦞🐹🪿🦄🦋⛅️🥲🫣🤕😩🦞🐹🪿🦄🦋⛅️.eth',
    expiryDate: now + 30 * TIME.DAY,
    timestamp: now - 29 * TIME.DAY,
  },
  {
    type: 'blog-post',
    timestamp: now - 29 * TIME.DAY,
    title: 'ENS Picks Linea for Layer 2 Rollout',
    imageUrl:
      'https://ens.domains/_next/static/media/cover-thumb.136ad78c.webp',
    url: 'https://ens.domains/blog/post/ens-picks-linea',
  },
  {
    type: 'name-expiry',
    name: 'erin.eth',
    expiryDate: now + 30 * TIME.DAY,
    timestamp: now - 60 * TIME.DAY,
  },
]
