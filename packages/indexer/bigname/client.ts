import { ResultFn } from '@ens-apps/utils/neverthrow'
import { err, ok, ResultAsync } from 'neverthrow'
import { BignameError, isBignameApiErrorCode } from './errors'
import type * as T from './types'

export type BignameClientOptions = {
  /** Injected for tests and for runtimes that wrap fetch. */
  readonly fetch?: typeof fetch
}

/** Per-call options; `signal` cancels the request in flight. */
type RequestOptions = Readonly<{ signal?: AbortSignal }>

type QueryValue = string | number | boolean | readonly string[] | undefined
type Query = Readonly<Record<string, QueryValue>>

// bigname rejects unknown parameters with 400, so only defined values are sent.
// `include`, `type`, `keys` and `relation` take comma-separated sets;
// `expires_window` is repeated once per window.
const REPEATED_PARAMS: ReadonlySet<string> = new Set(['expires_window'])

const toSearchParams = (query: Query | undefined): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue
    const values: readonly string[] = Array.isArray(value)
      ? value
      : [String(value)]
    if (REPEATED_PARAMS.has(key)) {
      for (const each of values) params.append(key, each)
    } else {
      params.set(key, values.join(','))
    }
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

const malformed = (response: Response, message: string, cause?: unknown) =>
  new BignameError({
    code: 'malformed_response',
    status: response.status,
    message,
    cause,
  })

const toApiError = async (response: Response): Promise<BignameError> => {
  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    return malformed(
      response,
      `bigname responded ${response.status} with a body that is not JSON`,
      cause,
    )
  }
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
    signal?: AbortSignal,
  ) {
    const url = `${base}${path}${toSearchParams(query)}`
    const init: RequestInit =
      body === undefined
        ? { method: 'GET', signal }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal,
          }

    const response = yield* ResultAsync.fromPromise(
      fetchImpl(url, init),
      networkError,
    )
    if (!response.ok) return err(await toApiError(response))

    const parsed = yield* ResultAsync.fromPromise(
      response.json() as Promise<unknown>,
      (cause) =>
        malformed(
          response,
          'bigname responded with a body that is not JSON',
          cause,
        ),
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
    { signal, body }: RequestOptions & Readonly<{ body?: unknown }> = {},
  ): ResultAsync<Res, BignameError> =>
    send(path, query, body, signal).map((envelope) => envelope as Res)

  const seg = encodeURIComponent

  return {
    status: (options?: RequestOptions) =>
      request<T.StatusData>('/v1/status', undefined, options),
    names: (query: T.NamesQuery, options?: RequestOptions) =>
      request<readonly T.NameListingRow[]>('/v1/names', query, options),
    name: (name: string, query?: T.NameRecordQuery, options?: RequestOptions) =>
      request<T.NameRecord>(`/v1/names/${seg(name)}`, query, options),
    nameRecords: (
      name: string,
      query?: T.NameRecordsQuery,
      options?: RequestOptions,
    ) =>
      request<T.NameRecords>(`/v1/names/${seg(name)}/records`, query, options),
    subnames: (
      name: string,
      query?: T.SubnamesQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.Subname[]>(
        `/v1/names/${seg(name)}/subnames`,
        query,
        options,
      ),
    nameHistory: (
      name: string,
      query?: T.NameHistoryQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.NameHistoryRow[]>(
        `/v1/names/${seg(name)}/history`,
        query,
        options,
      ),
    addressNames: (
      address: string,
      query?: T.AddressNamesQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.AddressName[]>(
        `/v1/addresses/${seg(address)}/names`,
        query,
        options,
      ),
    addressHistory: (
      address: string,
      query?: T.AddressHistoryQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.EventRow[]>(
        `/v1/addresses/${seg(address)}/history`,
        query,
        options,
      ),
    events: (query?: T.EventsQuery, options?: RequestOptions) =>
      request<readonly T.EventRow[]>('/v1/events', query, options),
    permissions: (query: T.PermissionsQuery, options?: RequestOptions) =>
      request<readonly T.PermissionRow[], T.PermissionsResponse>(
        '/v1/permissions',
        query,
        options,
      ),
    resolverRecords: (
      chainId: number,
      address: string,
      query: T.ResolverRecordsQuery,
      options?: RequestOptions,
    ) =>
      request<T.NameRecords>(
        `/v1/resolvers/${chainId}/${seg(address)}/records`,
        query,
        options,
      ),
    lookup: (body: T.LookupRequest, options?: RequestOptions) =>
      request<readonly T.LookupResult[]>('/v1/lookup', undefined, {
        ...options,
        body,
      }),
    registry: (
      chainId: number,
      address: string,
      query?: T.RegistryQuery,
      options?: RequestOptions,
    ) =>
      request<T.Registry>(
        `/v1/registries/${chainId}/${seg(address)}`,
        query,
        options,
      ),
    registryLabels: (
      chainId: number,
      address: string,
      query?: T.RegistryLabelsQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.RegistryLabel[]>(
        `/v1/registries/${chainId}/${seg(address)}/labels`,
        query,
        options,
      ),
    resolver: (
      chainId: number,
      address: string,
      query?: T.ResolverQuery,
      options?: RequestOptions,
    ) =>
      request<T.ResolverOverview>(
        `/v1/resolvers/${chainId}/${seg(address)}`,
        query,
        options,
      ),
    resolverLinks: (
      chainId: number,
      address: string,
      query?: T.ResolverQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.ResolverLink[]>(
        `/v1/resolvers/${chainId}/${seg(address)}/links`,
        query,
        options,
      ),
    resolverRoles: (
      chainId: number,
      address: string,
      query?: T.ResolverQuery,
      options?: RequestOptions,
    ) =>
      request<readonly T.ResolverRole[]>(
        `/v1/resolvers/${chainId}/${seg(address)}/roles`,
        query,
        options,
      ),
  }
}

export type BignameClient = ReturnType<typeof createBignameClient>
