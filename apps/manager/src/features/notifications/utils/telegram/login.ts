import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import type { InferResponseType } from 'hono'
import { err, fromPromise, ok } from 'neverthrow'
import * as v from 'valibot'
import { backendClient } from '@/utils/backend-client'

export type TelegramAttempt = NonNullable<
  InferResponseType<
    typeof backendClient.notifications.channels.telegram.oauth.$get,
    200
  >['attempt']
>
type TelegramLoginPhase =
  | Exclude<TelegramAttempt['status'], 'processing'>
  | 'idle'

export const getTelegramLoginPhase = (
  attempt: TelegramAttempt | null | undefined,
  now = Date.now(),
): TelegramLoginPhase => {
  if (!attempt) return 'idle'
  if (attempt.status === 'pending' || attempt.status === 'processing') {
    return new Date(attempt.expires_at).getTime() > now ? 'pending' : 'expired'
  }
  return attempt.status
}

export const telegramPollInterval = (
  attempt: TelegramAttempt | null | undefined,
): number | false => {
  if (!attempt || getTelegramLoginPhase(attempt) !== 'pending') return false
  return Math.min(
    5_000,
    Math.max(1, new Date(attempt.expires_at).getTime() - Date.now() + 50),
  )
}

export const openTelegramTab = (): Window | null =>
  // Some embedded browsers throw instead of returning null when blocked.
  fromSync(
    () => {
      const tab = window.open('about:blank', '_blank')
      if (tab) {
        tab.opener = null
        tab.document.title = 'Connecting Telegram…'
        tab.document.body.textContent =
          'Preparing Telegram login. Keep ENS Manager open in your original tab.'
      }
      return tab
    },
    () => undefined,
  ).unwrapOr(null)

const requestMessages = {
  initiate: 'Could not start Telegram login. Please try again.',
  status: 'Could not check Telegram login. Please try again.',
  cancel: 'Could not cancel Telegram login. Please try again.',
} as const
type TelegramOperation = keyof typeof requestMessages
type TelegramResponse = Pick<Response, 'ok' | 'status' | 'json'>

export class TelegramLoginRequestError extends TaggedError(
  'TelegramLoginRequestError',
)<{
  readonly operation: TelegramOperation
  readonly message: string
  readonly status?: number
  readonly cause?: unknown
}> {}

const requestTelegram = ResultFn(async function* (
  operation: TelegramOperation,
  request: () => Promise<TelegramResponse>,
) {
  const message = requestMessages[operation]
  const response = yield* fromPromise(
    Promise.resolve().then(request),
    (cause) => new TelegramLoginRequestError({ operation, message, cause }),
  )
  if (!response.ok) {
    // An unreadable error body must not hide the HTTP status.
    const body = await fromPromise<unknown, unknown>(
      response.json(),
      (cause) => cause,
    )
    const parsed = v.safeParse(
      v.object({ error: v.string() }),
      body.unwrapOr(null),
    )
    return yield* new TelegramLoginRequestError({
      operation,
      message: parsed.success ? parsed.output.error : message,
      status: response.status,
      cause: body.isErr() ? body.error : undefined,
    })
  }
  return ok(response)
})

const readTelegramResponse = ResultFn(async function* <
  TSchema extends v.GenericSchema,
>(
  operation: TelegramOperation,
  request: () => Promise<TelegramResponse>,
  schema: TSchema,
) {
  const response = yield* requestTelegram(operation, request)
  const failure = (cause: unknown) =>
    new TelegramLoginRequestError({
      operation,
      message: requestMessages[operation],
      status: response.status,
      cause,
    })
  const json = yield* fromPromise<unknown, TelegramLoginRequestError>(
    response.json(),
    failure,
  )
  return fromSync(() => v.parse(schema, json), failure)
})

const initiateTelegramLogin = () =>
  readTelegramResponse(
    'initiate',
    () =>
      backendClient.notifications.channels.telegram.oauth.$post(undefined, {
        init: { signal: AbortSignal.timeout(15_000) },
      }),
    v.object({
      id: v.string(),
      authorizationUrl: v.pipe(v.string(), v.url()),
      expires_at: v.pipe(v.string(), v.isoTimestamp()),
    }),
  )

export const startTelegramLogin = (tab: Window | null) =>
  initiateTelegramLogin()
    .map((attempt) => {
      // A blocked/closed tab is recoverable through the explicit link in Manager.
      fromSync(
        () => {
          if (tab && !tab.closed) tab.location.replace(attempt.authorizationUrl)
        },
        () => undefined,
      ).unwrapOr(undefined)
      return attempt
    })
    .orElse((error) => {
      fromSync(
        () => tab?.close(),
        () => undefined,
      ).unwrapOr(undefined)
      return err(error)
    })

export const getTelegramLoginStatus = (signal: AbortSignal) =>
  readTelegramResponse(
    'status',
    () =>
      backendClient.notifications.channels.telegram.oauth.$get(undefined, {
        init: {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        },
      }),
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
  )

export const cancelTelegramLogin = (id: string) =>
  requestTelegram('cancel', () =>
    backendClient.notifications.channels.telegram.oauth[':id'].$delete(
      { param: { id } },
      { init: { signal: AbortSignal.timeout(10_000) } },
    ),
  ).map(() => undefined)
