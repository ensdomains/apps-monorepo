/** A value the query builder accepts. `undefined`/`null`/`''`/`[]` are omitted. */
export type QueryValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | undefined
  | readonly (string | number)[]

export type QueryParams = Readonly<Record<string, QueryValue>>

const formatValue = (value: Exclude<QueryValue, null | undefined>): string => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(String).join(',')
  return String(value)
}

/**
 * Build a query string (with leading `?`, or `''` when empty).
 *
 * bigname rejects unknown parameters with 400, so absent values are dropped
 * rather than sent empty. Lists are comma-joined except `expires_window`,
 * which repeats its key. Every key and value is
 * percent-encoded, which keeps a `+` in an RFC 3339 offset (`+02:00`) from
 * being decoded as a space.
 */
export const buildQuery = (params: QueryParams): string => {
  const parts = Object.entries(params).flatMap(([key, value]) => {
    if (value === undefined || value === null) return []
    if (key === 'expires_window' && Array.isArray(value)) {
      return value.map(
        (window) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(window))}`,
      )
    }
    const formatted = formatValue(value)
    if (formatted === '') return []
    return [`${encodeURIComponent(key)}=${encodeURIComponent(formatted)}`]
  })
  return parts.length === 0 ? '' : `?${parts.join('&')}`
}

/** Percent-encode one path segment (a name, address or chain id). */
export const pathSegment = (value: string | number): string =>
  encodeURIComponent(String(value))

/** Join a base URL and a `/v1/...` path without doubling or dropping slashes. */
export const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
