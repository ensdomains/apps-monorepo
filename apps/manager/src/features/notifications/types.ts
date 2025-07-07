export type BaseNotification = {
  timestamp: number
  unread?: boolean
}

export type NameTransferredNotification = BaseNotification & {
  type: 'name-transferred'
  name: string
  txHash: string
  to: string
}

export type NameExpiryNotification = BaseNotification & {
  type: 'name-expiry'
  name: string
  expiryDate: number
}

export type BlogPostNotification = BaseNotification & {
  type: 'blog-post'
  title: string
  url: string
  imageUrl: string
}

export type Notification =
  | NameTransferredNotification
  | NameExpiryNotification
  | BlogPostNotification
