import { ResultAsync } from 'neverthrow'
import { BignameError, isBignameApiErrorCode } from './errors'
import type * as T from './types'

export type BignameClientOptions = {
  /** Injected for tests and for runtimes that wrap fetch. */
  readonly fetch?: typeof fetch
  /** Retries after the first attempt on 429, 503 and network failure. */
  readonly retries?: number
  readonly retryDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

type QueryValue = string | number | boolean | readonly string[] | undefined
type Query = Readonly<Record<string, QueryValue>>

const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 300
const MAX_BACKOFF_MS = 5_000
// A server that asks for a longer wait is believed, within reason.
const MAX_RETRY_AFTER_MS = 30_000
const RETRYABLE_STATUSES = new Set([429, 503])

const sleepFor = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

// bigname rejects unknown parameters with 400, so only defined values are sent.
// `include`, `type` and `relation` take comma-separated sets.
const toSearchParams = (query: Query | undefined): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue
    params.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

const isEnvelope = (body: unknown): body is T.Envelope<unknown> =>
  typeof body === 'object' && body !== null && 'data' in body && 'meta' in body

const retryDelay = (
  attempt: number,
  baseMs: number,
  retryAfter: string | null,
): number => {
  const fromHeader = retryAfter ? Number(retryAfter) * 1000 : Number.NaN
  if (Number.isFinite(fromHeader) && fromHeader >= 0) {
    return Math.min(fromHeader, MAX_RETRY_AFTER_MS)
  }
  const backoff = baseMs * 2 ** attempt + Math.floor(Math.random() * 100)
  return Math.min(backoff, MAX_BACKOFF_MS)
}

const toApiError = async (response: Response): Promise<BignameError> => {
  const body: unknown = await response.json().catch(() => undefined)
  const error =
    typeof body === 'object' && body !== null && 'error' in body
      ? (
          body as {
            error?: { code?: unknown; message?: unknown; details?: unknown }
          }
        ).error
      : undefined
  const code = isBignameApiErrorCode(error?.code) ? error.code : undefined
  return new BignameError({
    code: code ?? 'malformed_response',
    status: response.status,
    message:
      typeof error?.message === 'string'
        ? error.message
        : `bigname responded ${response.status} without an error body`,
    details: error?.details,
  })
}

/**
 * A client for one bigname deployment.
 *
 * Takes the base URL as an argument and reads no environment: the apps build
 * one at boot from `envConfig.endpoints.bignameApi`, the worker one per
 * request from its bindings. Every method returns the unwrapped envelope as a
 * `Result`, never throws, and sends no custom headers on GET, because the edge
 * answers CORS preflight only for `POST /v1/lookup`.
 */
export const createBignameClient = (
  baseUrl: string,
  options: BignameClientOptions = {},
) => {
  const base = baseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? globalThis.fetch
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const sleep = options.sleep ?? sleepFor

  const send = async (
    path: string,
    query: Query | undefined,
    body: unknown,
  ): Promise<Response> => {
    const url = `${base}${path}${toSearchParams(query)}`
    const init: RequestInit =
      body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }

    let attempt = 0
    for (;;) {
      let response: Response
      try {
        response = await fetchImpl(url, init)
      } catch (cause) {
        if (attempt >= retries) {
          throw new BignameError({
            code: 'network',
            message: `bigname request failed: ${String(cause)}`,
            cause,
          })
        }
        await sleep(retryDelay(attempt, retryDelayMs, null))
        attempt += 1
        continue
      }
      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= retries) {
        return response
      }
      await sleep(
        retryDelay(attempt, retryDelayMs, response.headers.get('retry-after')),
      )
      attempt += 1
    }
  }

  const request = <Data, Res extends T.Envelope<Data> = T.Envelope<Data>>(
    path: string,
    query?: Query,
    body?: unknown,
  ): ResultAsync<Res, BignameError> =>
    ResultAsync.fromPromise(
      (async () => {
        const response = await send(path, query, body)
        if (!response.ok) throw await toApiError(response)
        const parsed: unknown = await response.json().catch(() => undefined)
        if (!isEnvelope(parsed)) {
          throw new BignameError({
            code: 'malformed_response',
            status: response.status,
            message: 'bigname responded without a data envelope',
          })
        }
        return parsed as Res
      })(),
      (error) =>
        error instanceof BignameError
          ? error
          : new BignameError({
              code: 'network',
              message: `bigname request failed: ${String(error)}`,
              cause: error,
            }),
    )

  const seg = encodeURIComponent

  return {
    status: () => request<T.StatusData>('/v1/status'),
    names: (query: T.NamesQuery) =>
      request<readonly T.NameListingRow[]>('/v1/names', query),
    name: (name: string, query?: T.NameRecordQuery) =>
      request<T.NameRecord>(`/v1/names/${seg(name)}`, query),
    nameRecords: (name: string, query?: T.NameRecordsQuery) =>
      request<T.NameRecords>(`/v1/names/${seg(name)}/records`, query),
    subnames: (name: string, query?: T.SubnamesQuery) =>
      request<readonly T.Subname[]>(`/v1/names/${seg(name)}/subnames`, query),
    nameHistory: (name: string, query?: T.NameHistoryQuery) =>
      request<readonly T.NameHistoryRow[]>(
        `/v1/names/${seg(name)}/history`,
        query,
      ),
    addressNames: (address: string, query?: T.AddressNamesQuery) =>
      request<readonly T.AddressName[]>(
        `/v1/addresses/${seg(address)}/names`,
        query,
      ),
    addressHistory: (address: string, query?: T.AddressHistoryQuery) =>
      request<readonly T.AddressHistoryRow[]>(
        `/v1/addresses/${seg(address)}/history`,
        query,
      ),
    events: (query?: T.EventsQuery) =>
      request<readonly T.EventsRow[]>('/v1/events', query),
    permissions: (query: T.PermissionsQuery) =>
      request<readonly T.PermissionRow[], T.PermissionsResponse>(
        '/v1/permissions',
        query,
      ),
    lookup: (body: T.LookupRequest) =>
      request<readonly T.LookupResult[]>('/v1/lookup', undefined, body),
  }
}

export type BignameClient = ReturnType<typeof createBignameClient>
