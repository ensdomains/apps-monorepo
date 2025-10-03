import type { Prettify } from './helpers'

// ===============================
// Notifications
// ===============================

export type NameExpiryNotification = {
  kind: 'name-expiry'
  name: string
  expiryDate: number
}

export type NameTransferredNotification = {
  kind: 'name-transferred'
  name: string
  txHash: string
  to: string
}

export type Notification = NameExpiryNotification | NameTransferredNotification

export type Notifications = {
  [K in Notification as K['kind']]: Prettify<Omit<K, 'kind'>>
}

export type AnyNotificationPayload = Notifications[keyof Notifications]

// ===============================
// Broadcasts
// ===============================

export type BlogPostBroadcast = {
  kind: 'blog-post'
  title: string
  url: string
  imageUrl: string
}

export type Broadcast = BlogPostBroadcast

export type Broadcasts = {
  [K in Broadcast as K['kind']]: Prettify<Omit<K, 'kind'>>
}

export type AnyBroadcastPayload = Broadcasts[keyof Broadcasts]
