import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import type { InferResponseType } from 'hono'
import { err, fromPromise, fromThrowable, ok } from 'neverthrow'
import * as v from 'valibot'
import { backendClient } from '@/utils/backend-client'

export type TelegramAttempt = NonNullable<
  InferResponseType<
    typeof backendClient.notifications.channels.telegram.oauth.$get,
    200
  >['attempt']
>

export const isTelegramPending = (
  attempt: TelegramAttempt | null | undefined,
) =>
  Boolean(
    attempt &&
      (attempt.status === 'pending' || attempt.status === 'processing') &&
      new Date(attempt.expires_at).getTime() > Date.now(),
  )

export const telegramPollInterval = (
  attempt: TelegramAttempt | null | undefined,
) => {
  if (!isTelegramPending(attempt) || !attempt) return false
  return Math.min(
    5_000,
    Math.max(1, new Date(attempt.expires_at).getTime() - Date.now() + 50),
  )
}

export const openTelegramTab = () => {
  // Some embedded browsers throw instead of returning null when blocked.
  return fromThrowable(() => {
    const tab = window.open('about:blank', '_blank')
    if (tab) {
      tab.opener = null
      tab.document.title = 'Connecting Telegram…'
      tab.document.body.textContent =
        'Preparing Telegram login. Keep ENS Manager open in your original tab.'
    }
    return tab
  })().unwrapOr(null)
}

export class TelegramLoginRequestError extends TaggedError(
  'TelegramLoginRequestError',
)<{
  operation: 'initiate' | 'status' | 'cancel'
  phase: 'request' | 'response' | 'decode'
  message: string
  status?: number
  cause?: unknown
}> {}

const initiateTelegramLogin = ResultFn(async function* () {
  const response = yield* fromPromise(
    backendClient.notifications.channels.telegram.oauth.$post(undefined, {
      init: { signal: AbortSignal.timeout(15_000) },
    }),
    (cause) =>
      new TelegramLoginRequestError({
        operation: 'initiate',
        phase: 'request',
        message: 'Could not start Telegram login. Please try again.',
        cause,
      }),
  )
  const json = yield* fromPromise<unknown, TelegramLoginRequestError>(
    response.json(),
    (cause) =>
      new TelegramLoginRequestError({
        operation: 'initiate',
        phase: 'decode',
        message: 'Could not read the Telegram login response.',
        cause,
      }),
  )
  if (!response.ok) {
    const parsedError = v.safeParse(v.object({ error: v.string() }), json)
    return yield* new TelegramLoginRequestError({
      operation: 'initiate',
      phase: 'response',
      status: response.status,
      message: parsedError.success
        ? parsedError.output.error
        : 'Could not start Telegram login',
    })
  }
  const parsed = v.safeParse(
    v.object({
      id: v.string(),
      authorizationUrl: v.pipe(v.string(), v.url()),
      expires_at: v.pipe(v.string(), v.isoTimestamp()),
    }),
    json,
  )
  if (!parsed.success)
    return yield* new TelegramLoginRequestError({
      operation: 'initiate',
      phase: 'decode',
      message: 'Invalid Telegram login response.',
      cause: parsed.issues,
    })

  return ok(parsed.output)
})

export const startTelegramLogin = (tab: Window | null) =>
  initiateTelegramLogin()
    .map((attempt) => {
      // A blocked/closed tab is recoverable through the explicit link in Manager.
      // Deliberately downgrade a DOM navigation failure to that fallback.
      fromThrowable(() => {
        if (tab && !tab.closed) tab.location.replace(attempt.authorizationUrl)
      })().unwrapOr(undefined)
      return attempt
    })
    .orElse((error) => {
      fromThrowable(() => tab?.close())().unwrapOr(undefined)
      return err(error)
    })

export const getTelegramLoginStatus = ResultFn(async function* (
  signal: AbortSignal,
) {
  const response = yield* fromPromise(
    backendClient.notifications.channels.telegram.oauth.$get(undefined, {
      init: { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
    }),
    (cause) =>
      new TelegramLoginRequestError({
        operation: 'status',
        phase: 'request',
        message:
          'Could not check Telegram login. Return to Manager and try again.',
        cause,
      }),
  )
  if (!response.ok)
    return yield* new TelegramLoginRequestError({
      operation: 'status',
      phase: 'response',
      status: response.status,
      message: 'Could not check Telegram login. Please try again.',
    })
  const result = yield* fromPromise<unknown, TelegramLoginRequestError>(
    response.json(),
    (cause) =>
      new TelegramLoginRequestError({
        operation: 'status',
        phase: 'decode',
        message: 'Could not read the Telegram login status.',
        cause,
      }),
  )
  const parsed = v.safeParse(
    v.object({
      attempt: v.nullable(
        v.object({
          id: v.string(),
          expires_at: v.pipe(v.string(), v.isoTimestamp()),
          status: v.picklist([
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled',
            'expired',
          ]),
        }),
      ),
    }),
    result,
  )
  if (!parsed.success)
    return yield* new TelegramLoginRequestError({
      operation: 'status',
      phase: 'decode',
      message: 'Invalid Telegram login status.',
      cause: parsed.issues,
    })
  return ok(parsed.output)
})

export const cancelTelegramLogin = ResultFn(async function* (id: string) {
  const response = yield* fromPromise(
    backendClient.notifications.channels.telegram.oauth[':id'].$delete(
      { param: { id } },
      {
        init: { signal: AbortSignal.timeout(10_000) },
      },
    ),
    (cause) =>
      new TelegramLoginRequestError({
        operation: 'cancel',
        phase: 'request',
        message: 'Could not cancel Telegram login. Please try again.',
        cause,
      }),
  )
  if (!response.ok)
    return yield* new TelegramLoginRequestError({
      operation: 'cancel',
      phase: 'response',
      status: response.status,
      message: 'Could not cancel Telegram login. Please try again.',
    })
  return ok(undefined)
})
