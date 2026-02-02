/**
 * Push notification types for browser-side implementation.
 */

export type PushSubscriptionState = {
  /**
   * Whether push notifications are supported in this browser.
   */
  isSupported: boolean

  /**
   * Whether the service worker is registered and ready.
   */
  isReady: boolean

  /**
   * Current permission state.
   */
  permission: NotificationPermission

  /**
   * Whether user has an active push subscription.
   */
  isSubscribed: boolean

  /**
   * The current push subscription, if any.
   */
  subscription: PushSubscription | null

  /**
   * Error message if something went wrong.
   */
  error: string | null
}

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime: number | null
  keys: {
    auth: string
    p256dh: string
  }
}
