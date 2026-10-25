import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultMutationOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import type { ClientResponse } from 'hono/client'
import { fromPromise, ok } from 'neverthrow'
import { match, P } from 'ts-pattern'
import type { Channel } from '@/features/notifications/data/queries/channels'
import { channelsQueryOptions } from '@/features/notifications/data/queries/channels'
import {
  createPushSubscriptionResult,
  getExistingSubscriptionResult,
  getPermissionStateResult,
  getSubscriptionJsonResult,
  hashSubscriptionEndpointResult,
  isPushSupported,
  PushSubscriptionError,
  registerServiceWorkerResult,
  requestNotificationPermissionResult,
  unsubscribeLocalPushSubscriptionResult,
} from '@/features/notifications/services/push'
import type { PushErrorCode } from '@/features/notifications/types/push'
import { backendClient } from '@/utils/backend-client'

export type BrowserPushState = {
  isSupported: boolean
  permission: NotificationPermission
  endpointHash: string | null
}

export class PushChannelRequestError extends TaggedError(
  'PushChannelRequestError',
)<{
  cause: unknown
}> {}

export class PushPermissionDeniedError extends TaggedError(
  'PushPermissionDeniedError',
)<{
  /** The resulting permission state that prevented enabling notifications. */
  readonly permission: NotificationPermission
}> {}

export class ChannelNotFoundForEndpointError extends TaggedError(
  'ChannelNotFoundForEndpointError',
)<{
  endpointHash: string
}> {}

const parseJsonResult = ResultFn(async function* <T>(
  response: ClientResponse<T>,
) {
  const data = yield* fromPromise(
    response.json() as Promise<T>,
    (cause) => new PushChannelRequestError({ cause }),
  )

  return ok(data)
})

const browserPushStateQuery = ResultFn(async function* () {
  if (!isPushSupported()) {
    return ok({
      isSupported: false,
      permission: 'denied',
      endpointHash: null,
    } satisfies BrowserPushState)
  }

  const permission = yield* getPermissionStateResult()
  if (permission !== 'granted') {
    // Notification permission does not gate reading a push subscription, so
    // look for one that survived a previous session (the signature of a
    // session-scoped grant that expired while the browser was closed — or of
    // an existing install the user later revoked). Use getRegistration(),
    // which resolves promptly even when no service worker exists, instead of
    // register()/ready to avoid registering a worker for visitors who never
    // enabled notifications (and waiting forever on those who have not).
    const registration = yield* fromPromise(
      navigator.serviceWorker.getRegistration(),
      (cause) => new PushSubscriptionError({ cause }),
    )
    if (registration) {
      const subscription = yield* fromPromise(
        registration.pushManager.getSubscription(),
        (cause) => new PushSubscriptionError({ cause }),
      )
      if (subscription?.endpoint) {
        const endpointHash = yield* hashSubscriptionEndpointResult(
          subscription.endpoint,
        )
        return ok({
          isSupported: true,
          permission,
          endpointHash,
        } satisfies BrowserPushState)
      }
    }
    return ok({
      isSupported: true,
      permission,
      endpointHash: null,
    } satisfies BrowserPushState)
  }

  const registrationResult = await registerServiceWorkerResult()
  if (registrationResult.isErr()) {
    return ok({
      isSupported: false,
      permission,
      endpointHash: null,
    } satisfies BrowserPushState)
  }

  const subscription = yield* getExistingSubscriptionResult()
  if (!subscription?.endpoint) {
    return ok({
      isSupported: true,
      permission,
      endpointHash: null,
    } satisfies BrowserPushState)
  }

  const endpointHash = yield* hashSubscriptionEndpointResult(
    subscription.endpoint,
  )
  return ok({
    isSupported: true,
    permission,
    endpointHash,
  } satisfies BrowserPushState)
})

const getVapidPublicKeyResult = ResultFn(async function* () {
  const response = yield* fromPromise(
    backendClient.notifications.channels.push['vapid-public-key'].$get(),
    (cause) => new PushChannelRequestError({ cause }),
  )

  if (!response.ok) {
    return yield* new PushChannelRequestError({
      cause: new Error(`Failed to fetch VAPID public key: ${response.status}`),
    })
  }

  const data = yield* parseJsonResult<{ publicKey: string }>(response)

  return ok(data.publicKey)
})

const addPushChannelResult = ResultFn(async function* (subscription: {
  endpoint: string
  expirationTime: number | null
  keys: { auth: string; p256dh: string }
}) {
  const response = yield* fromPromise(
    backendClient.notifications.channels.push.$post({
      json: subscription,
    }),
    (cause) => new PushChannelRequestError({ cause }),
  )

  if (!response.ok) {
    return yield* new PushChannelRequestError({
      cause: new Error(`Failed to add push channel: ${response.status}`),
    })
  }

  const data = yield* parseJsonResult<{ id: string }>(response)

  return ok(data)
})

const deletePushChannelResult = ResultFn(async function* (channelId: string) {
  const response = yield* fromPromise(
    backendClient.notifications.channels[':id'].$delete({
      param: { id: channelId },
    }),
    (cause) => new PushChannelRequestError({ cause }),
  )

  if (!response.ok) {
    return yield* new PushChannelRequestError({
      cause: new Error(`Failed to delete push channel: ${response.status}`),
    })
  }

  const data = yield* parseJsonResult(response)

  return ok(data)
})

const findMatchingPushChannel = (
  channels: Channel[],
  endpointHash: string,
): Channel | undefined => {
  return channels.find(
    (channel) =>
      channel.channel === 'push' &&
      'endpointHash' in channel &&
      channel.endpointHash === endpointHash,
  )
}

const enableBrowserPushResult = ResultFn(async function* () {
  yield* registerServiceWorkerResult()

  const permission = yield* requestNotificationPermissionResult()
  if (permission !== 'granted') {
    return yield* new PushPermissionDeniedError({ permission })
  }

  const vapidPublicKey = yield* getVapidPublicKeyResult()
  const subscription = yield* createPushSubscriptionResult(vapidPublicKey)
  const subscriptionJson = yield* getSubscriptionJsonResult(subscription)
  const channelResult = await addPushChannelResult(subscriptionJson)
  if (channelResult.isErr()) {
    await unsubscribeLocalPushSubscriptionResult(subscription)
    return channelResult
  }
  const channel = channelResult.value
  return ok({ permission, channel })
})

const disableBrowserPushResult = ResultFn(async function* (
  queryClient: QueryClient,
) {
  const subscription = yield* getExistingSubscriptionResult()
  if (!subscription?.endpoint) {
    return ok({ removed: false as const })
  }

  const endpointHash = yield* hashSubscriptionEndpointResult(
    subscription.endpoint,
  )
  const channels = yield* fromPromise(
    queryClient.ensureQueryData(channelsQueryOptions),
    (cause) => new PushChannelRequestError({ cause }),
  )
  const matchedChannel = findMatchingPushChannel(channels, endpointHash)

  if (!matchedChannel) {
    return yield* new ChannelNotFoundForEndpointError({ endpointHash })
  }

  yield* deletePushChannelResult(matchedChannel.id)
  yield* unsubscribeLocalPushSubscriptionResult(subscription)

  return ok({ removed: true as const })
})

export const browserPushStateQueryOptions = resultQueryOptions({
  queryKey: qk('channels', 'push', { key: 'browser-state' }),
  queryFn: () => browserPushStateQuery(),
})

export const vapidPublicKeyQueryOptions = resultQueryOptions({
  queryKey: qk('channels', 'push', { key: 'vapid-public-key' }),
  queryFn: () => getVapidPublicKeyResult(),
  staleTime: Number.POSITIVE_INFINITY,
})

export const enableBrowserPushMutationOptions = resultMutationOptions({
  mutationKey: qk('channels', 'push', { key: 'enable' }),
  mutationFn: () => enableBrowserPushResult(),
  meta: {
    invalidates: [qk('channels', 'list')],
  },
})

export const disableBrowserPushMutationOptions = (queryClient: QueryClient) =>
  resultMutationOptions({
    mutationKey: qk('channels', 'push', { key: 'disable' }),
    mutationFn: () => disableBrowserPushResult(queryClient),
    meta: {
      invalidates: [qk('channels', 'list'), qk('preferences', 'list')],
    },
  })

const PUSH_SUBSCRIBE_TIMEOUT_PATTERN = /did not return within timeout period/i

/**
 * Brave ships with the "Use Google services for push messaging" option turned
 * off, which makes `pushManager.subscribe()` reject with a push service error.
 * The Brave runtime exposes `navigator.brand`-style internals only through
 * `navigator.brave`, so its presence is the signal we use. Brave's user agent
 * still looks exactly like Chrome's, so it cannot be detected from the UA.
 */
const isBraveBrowser = () =>
  typeof navigator !== 'undefined' && 'brave' in navigator

const causeNameOf = (cause: unknown): string | undefined => {
  if (typeof cause !== 'object' || cause === null) {
    return undefined
  }
  const name = (cause as { name?: unknown }).name
  return typeof name === 'string' ? name : undefined
}

const causeMessageOf = (cause: unknown): string => {
  if (typeof cause !== 'object' || cause === null) {
    return ''
  }
  const message = (cause as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

const causeToPushErrorCode = (cause: unknown): PushErrorCode => {
  // Duck-type instead of `instanceof Error`: rejections may be non-Error
  // values ({ name, message } objects) or Errors from another realm (e.g.
  // iframes), where `instanceof` is realm-local and fails
  const name = causeNameOf(cause)
  const message = causeMessageOf(cause)

  // "PushManager.subscribe did not return within timeout period" (our own
  // 15s watchdog in createPushSubscriptionResult)
  if (PUSH_SUBSCRIBE_TIMEOUT_PATTERN.test(message)) {
    return 'subscription-timeout'
  }

  // Chromium-based browsers reject subscription attempts with e.g.
  // "Registration failed - push service error" (Brave) or
  // "Registration failed - no push service available" (Chromium without a
  // reachable push backend), regardless of the DOMException name.
  if (/push service/i.test(message)) {
    return isBraveBrowser() ? 'brave-push-disabled' : 'push-service-unavailable'
  }

  return match(name)
    .returnType<PushErrorCode>()
    .with('NotAllowedError', () => 'browser-blocked')
    .with(P.union('NotSupportedError', 'SecurityError'), () => 'not-supported')
    .with('InvalidStateError', () => 'service-worker')
    .with(
      P.union('InvalidAccessError', 'TypeError'),
      // e.g. "Invalid applicationServerKey" — the browser rejected the key
      // the backend handed out
      () => 'invalid-server-key',
    )
    .with('AbortError', () => 'push-service-unavailable')
    .otherwise(() => 'unknown')
}

/**
 * Maps any error raised while enabling/disabling browser push to a
 * machine-readable {@link PushErrorCode}, so the UI can show specific,
 * actionable guidance (e.g. how to re-enable Brave's push service) instead of
 * a generic failure message or a raw error tag.
 */
export const getPushErrorCode = (error: unknown): PushErrorCode => {
  const taggedError = error as
    | (Error & {
        _tag?: string
        cause?: unknown
        permission?: NotificationPermission
      })
    | undefined
    | null

  if (!taggedError || typeof taggedError._tag !== 'string') {
    return 'unknown'
  }

  return match(taggedError._tag)
    .returnType<PushErrorCode>()
    .with('PushNotSupportedError', () => 'not-supported')
    .with(
      'PushPermissionRequestError',
      // e.g. some browsers throw NotAllowedError when the permission prompt
      // cannot be shown (no user gesture, prompt blocked by the browser)
      () => 'request-blocked',
    )
    .with('PushPermissionDeniedError', () =>
      // Browsers report 'default' when the prompt goes unanswered
      // (dismissed/ignored), and 'denied' after an explicit block
      taggedError.permission === 'denied'
        ? 'browser-blocked'
        : 'permission-dismissed',
    )
    .with('ServiceWorkerRegistrationError', () => 'service-worker')
    .with(
      P.union('PushChannelRequestError', 'ChannelNotFoundForEndpointError'),
      () => 'server',
    )
    .otherwise(() =>
      taggedError.cause ? causeToPushErrorCode(taggedError.cause) : 'unknown',
    )
}
