import { BignameError, errorFromResponse } from './errors'
import { buildQuery, joinUrl, type QueryParams } from './query'

export interface RetryOptions {
  /** Extra attempts after the first. Default 3. */
  readonly retries?: number
  /** First backoff step in ms; doubles per attempt. Default 250. */
  readonly baseDelayMs?: number
  /** Cap for any single wait, including `Retry-After`. Default 2000. */
  readonly maxDelayMs?: number
}

export interface RequestOptions {
  /** Aborts the request and any pending backoff (TanStack Query passes one). */
  readonly signal?: AbortSignal
}

export interface RawRequest extends RequestOptions {
  readonly method?: 'GET' | 'POST'
  /** Path under the base URL, e.g. `/v1/names/nick.eth`. */
  readonly path: string
  readonly query?: QueryParams
  readonly body?: unknown
  /**
   * Retry `409 stale` like a transient error. Right for single-resource reads,
   * first pages and history walks (whose cursors survive publications); wrong
   * for current-state continuations, whose cursor is dead and must restart.
   */
  readonly retryStale?: boolean
}

export interface RequestContext {
  readonly baseUrl: string
  readonly fetch: typeof fetch
  readonly retry: Required<RetryOptions>
  readonly headers: Readonly<Record<string, string>>
}

export const DEFAULT_RETRY: Required<RetryOptions> = {
  retries: 3,
  baseDelayMs: 250,
  maxDelayMs: 2000,
}

export const NO_RETRY: Required<RetryOptions> = { ...DEFAULT_RETRY, retries: 0 }

/**
 * Statuses retried with backoff: 408 request_timeout, 429 rate_limited,
 * 503 overloaded, plus 502/504 from the edge proxy in front of the API.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 502, 503, 504,
])

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

const isRetryable = (error: BignameError, retryStale: boolean): boolean =>
  error.status === 0 ||
  RETRYABLE_STATUSES.has(error.status) ||
  (retryStale && error.code === 'stale')

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/** `Retry-After` in seconds (the HTTP-date form is ignored). */
const retryAfterMs = (response: Response | undefined): number | undefined => {
  const header = response?.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

const backoffMs = (
  attempt: number,
  retry: Required<RetryOptions>,
  response: Response | undefined,
): number => {
  const exponential = retry.baseDelayMs * 2 ** attempt
  const jittered = exponential / 2 + (Math.random() * exponential) / 2
  return Math.min(retry.maxDelayMs, retryAfterMs(response) ?? jittered)
}

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

type AttemptResult =
  | { readonly ok: true; readonly body: unknown }
  | {
      readonly ok: false
      readonly error: BignameError
      readonly response?: Response
    }

const attempt = async (
  context: RequestContext,
  request: RawRequest,
  url: string,
): Promise<AttemptResult> => {
  const hasBody = request.body !== undefined
  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...context.headers,
    },
    body: hasBody ? JSON.stringify(request.body) : undefined,
    signal: request.signal,
  }
  let response: Response
  try {
    response = await context.fetch(url, init)
  } catch (cause) {
    if (isAbortError(cause) || request.signal?.aborted) throw cause
    const message = cause instanceof Error ? cause.message : String(cause)
    return {
      ok: false,
      error: new BignameError({
        status: 0,
        code: 'internal_error',
        message: `bigname request failed: ${message}`,
        url,
        cause,
      }),
    }
  }
  const body = await readJson(response)
  if (response.ok) {
    if (body === undefined) {
      return {
        ok: false,
        response,
        error: new BignameError({
          status: response.status,
          code: 'internal_error',
          message: 'bigname returned a non-JSON success response',
          url,
        }),
      }
    }
    return { ok: true, body }
  }
  return {
    ok: false,
    response,
    error: errorFromResponse(response.status, body, url),
  }
}

/**
 * Send one request, retrying transient failures with bounded exponential
 * backoff, and return the parsed JSON envelope. Rejects with `BignameError`.
 */
export const sendRequest = async <TEnvelope>(
  context: RequestContext,
  request: RawRequest,
): Promise<TEnvelope> => {
  const url =
    joinUrl(context.baseUrl, request.path) + buildQuery(request.query ?? {})
  const retryStale = request.retryStale ?? true
  for (let attemptIndex = 0; ; attemptIndex++) {
    const result = await attempt(context, request, url)
    if (result.ok) return result.body as TEnvelope
    const canRetry =
      attemptIndex < context.retry.retries &&
      isRetryable(result.error, retryStale)
    if (!canRetry) throw result.error
    await sleep(
      backoffMs(attemptIndex, context.retry, result.response),
      request.signal,
    )
  }
}
