import { TaggedError } from '@ens-apps/utils/neverthrow'

/** Codes bigname serves in its error body, with the HTTP status each maps to. */
export const BIGNAME_API_ERROR_CODES = [
  'invalid_input', // 400
  'not_found', // 404
  'request_timeout', // 408
  'stale', // 409, a cursor's publication moved on: restart without it
  'conflict', // 409
  'unsupported', // 422
  'rate_limited', // 429
  'internal_error', // 500
  'overloaded', // 503
] as const

export type BignameApiErrorCode = (typeof BIGNAME_API_ERROR_CODES)[number]

/** API codes plus the ones the client produces itself. */
export type BignameErrorCode =
  | BignameApiErrorCode
  | 'network'
  | 'malformed_response'
  // allPages hit its page limit with rows still remaining
  | 'page_limit'

export class BignameError extends TaggedError('BIGNAME_ERROR')<{
  readonly code: BignameErrorCode
  readonly status?: number
  readonly details?: unknown
}> {}

export const isBignameApiErrorCode = (
  value: unknown,
): value is BignameApiErrorCode =>
  typeof value === 'string' &&
  (BIGNAME_API_ERROR_CODES as readonly string[]).includes(value)

/** A current-state collection cursor whose publication moved on. */
export const isStale = (error: unknown): error is BignameError =>
  error instanceof BignameError && error.code === 'stale'
