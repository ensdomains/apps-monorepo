import { ResultFn } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import { BignameError, isBignameApiErrorCode } from './errors'
import type * as T from './types'

export type BignameClientOptions = {
  /** Injected for tests and for runtimes that wrap fetch. */
  readonly fetch?: typeof fetch
}

type QueryValue = string | number | boolean | readonly string[] | undefined
type Query = Readonly<Record<string, QueryValue>>

// bigname rejects unknown parameters with 400, so only defined values are sent.
// `include`, `type`, `keys` and `relation` take comma-separated sets.
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

const networkError = (cause: unknown) =>
  new BignameError({
    code: 'network',
    message: `bigname request failed: ${String(cause)}`,
    cause,
  })

const malformed = (response: Response, message: string) =>
  new BignameError({
    code: 'malformed_response',
    status: response.status,
    message,
  })

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
  if (!isBignameApiErrorCode(error?.code)) {
    return malformed(
      response,
      `bigname responded ${response.status} without an error body`,
    )
  }
  return new BignameError({
    code: error.code,
    status: response.status,
    message: typeof error.message === 'string' ? error.message : error.code,
    details: error.details,
  })
}

/**
 * A client for one bigname deployment: typed routes, query serialization and
 * envelope parsing, nothing more. One call is one HTTP attempt and one page.
 * Retry, paging and stale-cursor restarts belong to the caller, which on the
 * frontend is TanStack Query and on the worker is the job's own loop.
 *
 * Takes the base URL as an argument and reads no environment. GET requests
 * carry no headers: the edge answers CORS preflight only for `POST /v1/lookup`.
 */
export const createBignameClient = (
  baseUrl: string,
  options: BignameClientOptions = {},
) => {
  const base = baseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? globalThis.fetch

  const send = ResultFn(async function* (
    path: string,
    query?: Query,
    body?: unknown,
  ) {
    const url = `${base}${path}${toSearchParams(query)}`
    const init: RequestInit =
      body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }

    const response = yield* ResultAsync.fromPromise(
      fetchImpl(url, init),
      networkError,
    )
    if (!response.ok) return err(await toApiError(response))

    const parsed = yield* ResultAsync.fromPromise(
      response.json() as Promise<unknown>,
      () =>
        malformed(response, 'bigname responded with a body that is not JSON'),
    )
    if (!isEnvelope(parsed)) {
      return err(
        malformed(response, 'bigname responded without a data envelope'),
      )
    }
    return ok(parsed)
  })

  const request = <Data, Res extends T.Envelope<Data> = T.Envelope<Data>>(
    path: string,
    query?: Query,
    body?: unknown,
  ): ResultAsync<Res, BignameError> =>
    send(path, query, body).map((envelope) => envelope as Res)

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
