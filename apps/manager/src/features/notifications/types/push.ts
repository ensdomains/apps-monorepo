/**
 * Push notification types for browser-side implementation.
 */

export type PushSubscriptionState = {
  /**
   * Whether push notifications are supported in this browser.
   */
  readonly isSupported: boolean

  /**
   * Whether the service worker is registered and ready.
   */
  readonly isReady: boolean

  /**
   * Current permission state.
   */
  readonly permission: NotificationPermission

  /**
   * Whether user has an active push subscription.
   */
  readonly isSubscribed: boolean

  /**
   * The current push subscription, if any.
   */
  readonly subscription: PushSubscription | null

  /**
   * Error message if something went wrong.
   */
  readonly error: string | null
}

/**
 * Machine-readable reason for a failed push notification operation.
 *
 * Derived from the tagged push errors and the underlying browser error causes
 * (e.g. DOMException names and messages), so the notification settings UI can
 * translate each reason into concrete, actionable guidance instead of showing
 * a generic failure message.
 */
export type PushErrorCode =
  /** The browser lacks the Web Push APIs entirely. */
  | 'not-supported'
  /** Brave with “Use Google services for push messaging” turned off. */
  | 'brave-push-disabled'
  /** The browser has no reachable push delivery service. */
  | 'push-service-unavailable'
  /** Notifications are blocked in the browser's site settings. */
  | 'browser-blocked'
  /** The permission prompt itself was blocked by the browser. */
  | 'request-blocked'
  /** The permission prompt was not answered (browser reports 'default'). */
  | 'permission-dismissed'
  /** The notification service worker failed to register or activate. */
  | 'service-worker'
  /** Push registration timed out (likely a connectivity issue). */
  | 'subscription-timeout'
  /** The backend returned a push server key the browser rejected. */
  | 'invalid-server-key'
  /** A backend (notification service) request failed. */
  | 'server'
  /** An unexpected failure with no more specific cause. */
  | 'unknown'

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime: number | null
  keys: {
    auth: string
    p256dh: string
  }
}
