/**
 * Push notification service.
 *
 * Handles service worker registration, push subscription management,
 * and communication with the backend API.
 *
 * Usage:
 * ```tsx
 * import { usePushNotifications } from '@/features/notifications/services/push'
 *
 * function PushSettings() {
 *   const {
 *     state,
 *     subscribe,
 *     unsubscribe,
 *     requestPermission,
 *   } = usePushNotifications()
 *
 *   if (!state.isSupported) {
 *     return <p>Push notifications not supported</p>
 *   }
 *
 *   if (state.permission === 'denied') {
 *     return <p>Notifications blocked. Enable in browser settings.</p>
 *   }
 *
 *   return (
 *     <button onClick={state.isSubscribed ? unsubscribe : subscribe}>
 *       {state.isSubscribed ? 'Disable' : 'Enable'} Push Notifications
 *     </button>
 *   )
 * }
 * ```
 */

import { useCallback, useEffect, useState } from 'react'
import { backendClient } from '@/utils/backend-client'
import type { PushSubscriptionState } from '../../types/push'

const SERVICE_WORKER_PATH = '/push-sw.js'

/**
 * Check if push notifications are supported in this browser.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Get the current notification permission state.
 */
export function getPermissionState(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }
  return Notification.permission
}

/**
 * Request notification permission from the user.
 * Returns the new permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    return 'denied'
  }
  return Notification.requestPermission()
}

/**
 * Register the push service worker.
 * Returns the ServiceWorkerRegistration or null if failed.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_PATH,
      { scope: '/' },
    )

    // wait for the service worker to be ready
    await navigator.serviceWorker.ready

    return registration
  } catch (error) {
    console.error('Failed to register push service worker:', error)
    return null
  }
}

/**
 * Get the existing push subscription, if any.
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    return registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

/**
 * Fetch the VAPID public key from the server.
 */
export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const response =
      await backendClient.notifications.channels.push['vapid-public-key'].$get()

    if (!response.ok) {
      console.error('Failed to fetch VAPID public key')
      return null
    }

    const data = await response.json()
    return data.publicKey
  } catch (error) {
    console.error('Failed to fetch VAPID public key:', error)
    return null
  }
}

/**
 * Convert a base64 string to Uint8Array (for applicationServerKey).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

/**
 * Subscribe to push notifications.
 * Handles the full flow: permission request, subscription creation, and server registration.
 */
export async function subscribeToPush(): Promise<{
  success: boolean
  subscription?: PushSubscription
  channelId?: string
  error?: string
}> {
  // check support
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications not supported' }
  }

  // request permission if needed
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    return { success: false, error: 'Notification permission denied' }
  }

  // get service worker registration
  const registration = await navigator.serviceWorker.ready

  // fetch VAPID public key
  const vapidPublicKey = await fetchVapidPublicKey()
  if (!vapidPublicKey) {
    return { success: false, error: 'Failed to get server public key' }
  }

  try {
    // create push subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    // send subscription to server
    const subscriptionJson = subscription.toJSON()

    if (
      !subscriptionJson.endpoint ||
      !subscriptionJson.keys?.auth ||
      !subscriptionJson.keys?.p256dh
    ) {
      await subscription.unsubscribe()
      return { success: false, error: 'Invalid subscription data' }
    }

    const response = await backendClient.notifications.channels.push.$post({
      json: {
        endpoint: subscriptionJson.endpoint,
        expirationTime: subscriptionJson.expirationTime ?? null,
        keys: {
          auth: subscriptionJson.keys.auth,
          p256dh: subscriptionJson.keys.p256dh,
        },
      },
    })

    if (!response.ok) {
      const error = await response.json()
      // unsubscribe locally since server registration failed
      await subscription.unsubscribe()
      return {
        success: false,
        error:
          'error' in error ? error.error : 'Failed to register subscription',
      }
    }

    const data = await response.json()

    return {
      success: true,
      subscription,
      channelId: data.id,
    }
  } catch (error) {
    console.error('Failed to subscribe to push:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Subscription failed',
    }
  }
}

/**
 * Unsubscribe from push notifications.
 * Removes local subscription and notifies server.
 */
export async function unsubscribeFromPush(channelId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // notify server
    const response = await backendClient.notifications.channels[':id'].$delete({
      param: { id: channelId },
    })

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: 'error' in error ? error.error : 'Failed to unsubscribe',
      }
    }

    // unsubscribe locally after server confirms
    const subscription = await getExistingSubscription()

    if (subscription) {
      await subscription.unsubscribe()
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to unsubscribe from push:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unsubscribe failed',
    }
  }
}

/**
 * React hook for managing push notifications.
 *
 * Provides reactive state and actions for push subscription management.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    isReady: false,
    permission: 'default',
    isSubscribed: false,
    subscription: null,
    error: null,
  })

  const [isLoading, setIsLoading] = useState(false)

  // initialize on mount
  useEffect(() => {
    const init = async () => {
      const isSupported = isPushSupported()

      if (!isSupported) {
        setState((prev) => ({ ...prev, isSupported: false }))
        return
      }

      // register service worker
      const registration = await registerServiceWorker()
      const isReady = registration !== null

      // get current permission and subscription
      const permission = getPermissionState()
      const subscription = await getExistingSubscription()

      setState({
        isSupported: true,
        isReady,
        permission,
        isSubscribed: subscription !== null,
        subscription,
        error: null,
      })
    }

    init()
  }, [])

  // listen for permission changes
  useEffect(() => {
    if (!state.isSupported) return

    // check permission periodically (no native event for this)
    const interval = setInterval(() => {
      const permission = getPermissionState()
      if (permission !== state.permission) {
        setState((prev) => ({ ...prev, permission }))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [state.isSupported, state.permission])

  const subscribe = useCallback(async () => {
    setIsLoading(true)
    setState((prev) => ({ ...prev, error: null }))

    const result = await subscribeToPush()

    if (result.success && result.subscription) {
      const { subscription } = result
      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        subscription,
        permission: 'granted',
        error: null,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        error: result.error ?? 'Failed to subscribe',
        permission: getPermissionState(),
      }))
    }

    setIsLoading(false)
    return result
  }, [])

  const unsubscribe = useCallback(async (channelId: string) => {
    setIsLoading(true)
    setState((prev) => ({ ...prev, error: null }))

    const result = await unsubscribeFromPush(channelId)

    if (result.success) {
      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        subscription: null,
        error: null,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        error: result.error ?? 'Failed to unsubscribe',
      }))
    }

    setIsLoading(false)
    return result
  }, [])

  const requestPermission = useCallback(async () => {
    const permission = await requestNotificationPermission()
    setState((prev) => ({ ...prev, permission }))
    return permission
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return {
    state,
    isLoading,
    subscribe,
    unsubscribe,
    requestPermission,
    clearError,
  }
}
