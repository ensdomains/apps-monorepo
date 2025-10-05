import type { KindToPayload, Prettify } from './helpers'

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

export type Notifications = KindToPayload<Notification>

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

export type Broadcasts = KindToPayload<Broadcast>

export type AnyBroadcastPayload = Broadcasts[keyof Broadcasts]

// ===============================
// User Channels
// ===============================

export type ChannelData = {
  email: null
  telegram: {
    username: string
  }
  push: {
    token: string
  }
}

export type UserChannel = keyof ChannelData

export type AnyChannelData = ChannelData[keyof ChannelData]
