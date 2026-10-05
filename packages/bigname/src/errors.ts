import type { BignameErrorCode } from './types'

const ERROR_CODES: readonly BignameErrorCode[] = [
  'invalid_input',
  'not_found',
  'unsupported',
  'stale',
  'conflict',
  'request_timeout',
  'rate_limited',
  'overloaded',
  'internal_error',
]

/** Fallback code for a non-envelope error response, by HTTP status. */
const CODE_BY_STATUS: Readonly<Record<number, BignameErrorCode>> = {
  400: 'invalid_input',
  404: 'not_found',
  408: 'request_timeout',
  409: 'stale',
  422: 'unsupported',
  429: 'rate_limited',
  503: 'overloaded',
}

/** Start of the rejection that lists the `include` values a route accepts. */
const INCLUDE_REJECTION = 'include must contain only '

export interface BignameErrorInit {
  readonly status: number
  readonly code: BignameErrorCode
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
  readonly url?: string
  readonly cause?: unknown
}

/**
 * Every failed bigname request rejects with this. `status` is the HTTP status
 * (0 when the request never got a response), `code` the contract error code.
 */
export class BignameError extends Error {
  readonly _tag = 'BignameError' as const
  readonly status: number
  readonly code: BignameErrorCode
  readonly details: Readonly<Record<string, unknown>>
  readonly url?: string

  constructor(init: BignameErrorInit) {
    super(
      init.message,
      init.cause === undefined ? undefined : { cause: init.cause },
    )
    this.name = 'BignameError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? {}
    this.url = init.url
  }
}

export const isBignameError = (
  error: unknown,
  code?: BignameErrorCode,
): error is BignameError =>
  error instanceof BignameError && (code === undefined || error.code === code)

const isErrorCode = (value: unknown): value is BignameErrorCode =>
  typeof value === 'string' && ERROR_CODES.includes(value as BignameErrorCode)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Build a BignameError from a non-2xx response body (parsed JSON or undefined). */
export const errorFromResponse = (
  status: number,
  body: unknown,
  url: string,
): BignameError => {
  const envelope =
    isRecord(body) && isRecord(body.error) ? body.error : undefined
  const code = isErrorCode(envelope?.code)
    ? envelope.code
    : (CODE_BY_STATUS[status] ?? 'internal_error')
  const message =
    typeof envelope?.message === 'string'
      ? envelope.message
      : `bigname request failed with HTTP ${status}`
  const details = isRecord(envelope?.details) ? envelope.details : undefined
  return new BignameError({ status, code, message, details, url })
}

/**
 * True when bigname rejected `param` as a query parameter it does not know:
 * the `400 invalid_input` a deployment answers for a parameter added after
 * its version, such as `registry` on `listPermissions` against v0.4.1. Any
 * other rejection of the same request (a malformed value, a combination the
 * route does not accept) is `false`.
 */
export const isUnknownQueryParamError = (
  error: unknown,
  param: string,
): error is BignameError =>
  isBignameError(error, 'invalid_input') &&
  error.message === `unknown query parameter: ${param}`

/**
 * True when bigname rejected an `include` list because the route does not
 * know `value`: the `400 invalid_input` a deployment answers for an expansion
 * added after its version, such as `total_count` on `listAddressNames`
 * against v0.4.1. A deployment that knows `value` but refuses it for this
 * request (`total_count` with `relation=resolves_to`) is `false`.
 */
export const isUnsupportedIncludeError = (
  error: unknown,
  value: string,
): error is BignameError => {
  if (!isBignameError(error, 'invalid_input')) return false
  if (!error.message.startsWith(INCLUDE_REJECTION)) return false
  const accepted = error.message.slice(INCLUDE_REJECTION.length).split(/[\s,]+/)
  return !accepted.includes(value)
}
