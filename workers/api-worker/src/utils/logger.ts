/* Structured logger for Cloudflare Workers */
export interface LogMeta {
  [key: string]: unknown
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'
export type ErrorLike = {
  name?: string
  message: string
  stack?: string
  cause?: unknown
  errors?: unknown[]
  [key: string]: unknown
}

const _LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']
const _DEV_ONLY_LEVELS = new Set<LogLevel>(['trace', 'debug'])

const _isDevelopment = (): boolean => {
  return Boolean(import.meta.env.DEV || import.meta.env.MODE === 'development')
}

const CIRCULAR_REFERENCE_TAG = '[circular]'

/**
 * Runtime guard used by logger serialization.
 *
 * This is intentionally broader than `instanceof Error` so we can serialize:
 * - cross-realm errors (where `instanceof` may fail),
 * - error-like objects from libraries/workers,
 * while still avoiding normal log payload objects with a `message` field.
 */
export function isErrorLike(value: unknown): value is ErrorLike {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const maybeError = value as {
    message?: unknown
    name?: unknown
    stack?: unknown
    cause?: unknown
    errors?: unknown
  }

  if (typeof maybeError.message !== 'string') {
    return false
  }

  const constructorName =
    typeof (value as { constructor?: unknown }).constructor === 'function'
      ? ((value as { constructor: { name?: unknown } }).constructor.name ?? '')
      : ''
  const cause = maybeError.cause
  // Support both `cause` and VError-style `cause()` patterns.
  const hasErrorLikeCause =
    typeof cause === 'function' ||
    (typeof cause === 'object' &&
      cause !== null &&
      typeof (cause as { message?: unknown }).message === 'string')

  return Boolean(
    value instanceof Error ||
      typeof maybeError.stack === 'string' ||
      hasErrorLikeCause ||
      Array.isArray(maybeError.errors) ||
      (typeof constructorName === 'string' &&
        constructorName.length > 0 &&
        constructorName.endsWith('Error')),
  )
}

/**
 * Reads `error.cause` in both modern and legacy function-style forms.
 *
 * Some libraries expose `cause()` instead of `cause`, and this helper keeps
 * serializer logic centralized and safe from thrown cause accessors.
 */
export function getErrorCause(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  let cause: unknown
  try {
    cause = (error as { cause?: unknown }).cause
  } catch {
    // Defensive: if cause getter throws, omit cause from logs.
    return undefined
  }

  if (typeof cause === 'function') {
    try {
      // Some libraries expose cause as a lazy getter function.
      return cause.call(error)
    } catch {
      // Never let cause access break logging.
      return undefined
    }
  }

  return cause
}

/** Returns a stable type label for log output. */
function getErrorType(error: ErrorLike): string {
  const ctor = (error as { constructor?: unknown }).constructor
  if (typeof ctor === 'function' && ctor.name) {
    return ctor.name
  }
  if (typeof error.name === 'string' && error.name.length > 0) {
    return error.name
  }
  return 'Error'
}

/**
 * Internal recursive error serializer.
 *
 * `seenErrors` prevents infinite recursion in circular error graphs.
 * `seenObjects` is shared with generic value serialization so nested custom
 * fields also get circular protection and bigint normalization.
 */
function _serializeError(
  error: ErrorLike,
  seenErrors: Set<object>,
  seenObjects: WeakSet<object>,
): Record<string, unknown> {
  if (seenErrors.has(error)) {
    // Mark cycles instead of recursing infinitely through cause chains.
    return {
      type: getErrorType(error),
      message: error.message,
      stack: error.stack,
      circular: true,
    }
  }

  seenErrors.add(error)

  const serialized: Record<string, unknown> = {
    type: getErrorType(error),
    message: error.message,
    stack: error.stack,
  }

  if (Array.isArray(error.errors)) {
    // Preserve AggregateError-like payloads in a stable key.
    serialized.aggregateErrors = error.errors.map((item) => {
      if (isErrorLike(item)) {
        return _serializeError(item, seenErrors, seenObjects)
      }
      return serializeLogValue(item, seenObjects)
    })
  }

  const cause = getErrorCause(error)
  if (cause !== undefined) {
    // Keep explicit cause tree for production debugging fidelity.
    serialized.cause = isErrorLike(cause)
      ? _serializeError(cause, seenErrors, seenObjects)
      : serializeLogValue(cause, seenObjects)
  }

  for (const key of Object.keys(error)) {
    if (serialized[key] !== undefined) {
      continue
    }

    const value = error[key]

    if (isErrorLike(value)) {
      if (key !== 'cause') {
        serialized[key] = _serializeError(value, seenErrors, seenObjects)
      }
      continue
    }

    serialized[key] = serializeLogValue(value, seenObjects)
  }

  Object.defineProperty(serialized, 'raw', {
    // Keep original error reference for in-process introspection.
    enumerable: false,
    value: error,
  })

  return serialized
}

/**
 * Public error serializer entrypoint.
 *
 * Non error-like values are returned unchanged so call sites can safely pass
 * unknown values without pre-branching.
 */
export function serializeError(error: unknown): unknown {
  if (!isErrorLike(error)) {
    return error
  }
  return _serializeError(error, new Set<object>(), new WeakSet<object>())
}

/**
 * Generic log value normalizer used before JSON stringification.
 *
 * Responsibilities:
 * - normalize non-JSON primitives (bigint, non-finite numbers),
 * - serialize error-like objects with full detail,
 * - protect against circular references,
 * - drop non-serializable fields (functions/symbols/undefined).
 */
export function serializeLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null
  }

  if (isErrorLike(value)) {
    return _serializeError(value, new Set<object>(), seen)
  }

  if (value instanceof Date) {
    // `toJSON()` returns null for invalid dates, unlike `toISOString()` which throws.
    return value.toJSON()
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return CIRCULAR_REFERENCE_TAG
    }

    // Track object identity across the whole traversal to break cycles.
    seen.add(value)

    if (Array.isArray(value)) {
      return value.map((item) => serializeLogValue(item, seen))
    }

    if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
      const jsonValue = (value as { toJSON: () => unknown }).toJSON()
      return serializeLogValue(jsonValue, seen)
    }

    const serializedObject: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const serializedValue = serializeLogValue(nestedValue, seen)
      // Match JSON.stringify behavior for unsupported values in objects.
      if (serializedValue !== undefined) {
        serializedObject[key] = serializedValue
      }
    }
    return serializedObject
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }

  return value
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: ANSI.gray,
  debug: ANSI.cyan,
  info: ANSI.green,
  warn: ANSI.yellow,
  error: ANSI.red,
}

const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
}

const META_INDENT = '    '

function paint(enabled: boolean, code: string, text: string): string {
  if (!enabled) {
    return text
  }
  return `${code}${text}${ANSI.reset}`
}

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && _LEVELS.includes(value as LogLevel)
}

/** Formats an ISO timestamp as a compact local clock time for terminal output. */
function formatClockTime(timestamp: unknown): string {
  const date =
    typeof timestamp === 'string' || typeof timestamp === 'number'
      ? new Date(timestamp)
      : new Date(Number.NaN)

  if (Number.isNaN(date.getTime())) {
    return '--:--:--.---'
  }

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

function formatLevelLabel(level: unknown, color: boolean): string {
  const normalized = isLogLevel(level) ? level : 'info'
  const label = normalized.toUpperCase().padEnd(5, ' ')
  return paint(color, `${ANSI.bold}${LEVEL_COLORS[normalized]}`, label)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Pretty-prints a single log value in a YAML-ish style so nested errors and
 * stack traces stay readable in the terminal.
 */
function formatHumanValue(
  value: unknown,
  indent: string,
  color: boolean,
): string {
  if (value === null) {
    return paint(color, ANSI.dim, 'null')
  }

  if (typeof value === 'boolean') {
    return paint(color, ANSI.magenta, String(value))
  }

  if (typeof value === 'number') {
    return paint(color, ANSI.yellow, String(value))
  }

  if (typeof value === 'string') {
    if (!value.includes('\n')) {
      return value
    }

    return value
      .split('\n')
      .map((line) => `${indent}${paint(color, ANSI.dim, line)}`)
      .join('\n')
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return paint(color, ANSI.dim, '[]')
    }

    const allPrimitive = value.every(
      (item) => item === null || typeof item !== 'object',
    )
    if (allPrimitive) {
      return `[${value.map((item) => formatHumanValue(item, indent, color)).join(', ')}]`
    }

    return value
      .map((item) => {
        const formatted = formatHumanValue(item, `${indent}  `, color)
        return `${indent}- ${formatted.trimStart()}`
      })
      .join('\n')
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return paint(color, ANSI.dim, '{}')
    }

    return formatHumanFields(value, indent, color)
  }

  return String(value)
}

function formatHumanFields(
  fields: Record<string, unknown>,
  indent: string,
  color: boolean,
): string {
  return Object.entries(fields)
    .map(([key, nested]) => {
      const keyLabel = paint(color, ANSI.cyan, key)

      if (typeof nested === 'string' && nested.includes('\n')) {
        return `${indent}${keyLabel}:\n${formatHumanValue(nested, `${indent}  `, color)}`
      }

      if (
        Array.isArray(nested) &&
        nested.some((item) => typeof item === 'object')
      ) {
        return `${indent}${keyLabel}:\n${formatHumanValue(nested, `${indent}  `, color)}`
      }

      if (isPlainObject(nested) && Object.keys(nested).length > 0) {
        return `${indent}${keyLabel}:\n${formatHumanValue(nested, `${indent}  `, color)}`
      }

      return `${indent}${keyLabel}: ${formatHumanValue(nested, `${indent}  `, color)}`
    })
    .join('\n')
}

export type HumanLogOptions = {
  color?: boolean
}

/**
 * Renders a structured log entry as a colorized, multi-line terminal string.
 *
 * Used in development only — production keeps single-line JSON for log drains.
 */
export function formatHumanLog(
  entry: Record<string, unknown>,
  options: HumanLogOptions = {},
): string {
  const color = options.color ?? true
  const { timestamp, level, message, ...meta } = entry
  const time = paint(color, ANSI.dim, formatClockTime(timestamp))
  const levelLabel = formatLevelLabel(level, color)
  const messageText = paint(
    color,
    ANSI.bold,
    typeof message === 'string' ? message : String(message ?? ''),
  )
  const header = `${time}  ${levelLabel}  ${messageText}`

  if (Object.keys(meta).length === 0) {
    return header
  }

  return `${header}\n${formatHumanFields(meta, META_INDENT, color)}`
}

export class Logger {
  // Vite sets MODE to "development" for `vite dev`, "production" for builds,
  // and "test" for Vitest. Pretty-printing on DEV would also fire in tests.
  private readonly useHumanLogs = import.meta.env.MODE === 'development'

  private shouldLog(_level: LogLevel): boolean {
    // Temporarily allow all levels for debugging in production.
    return true

    // if (!LEVELS.includes(level)) {
    //   return false
    // }

    // if (DEV_ONLY_LEVELS.has(level) && !this.isDev) {
    //   return false
    // }

    // return true
  }

  private serialize(entry: Record<string, unknown>): string {
    return JSON.stringify(serializeLogValue(entry))
  }

  isLevelEnabled(level: LogLevel): boolean {
    return this.shouldLog(level)
  }

  log(level: LogLevel, message: string, meta?: LogMeta): void {
    if (!this.shouldLog(level)) {
      return
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    }

    if (this.useHumanLogs) {
      const serialized = serializeLogValue(logEntry) as Record<string, unknown>
      console[CONSOLE_METHOD[level]](formatHumanLog(serialized))
      return
    }

    console.log(this.serialize(logEntry))
  }

  trace(message: string, meta?: LogMeta): void {
    this.log('trace', message, meta)
  }

  debug(message: string, meta?: LogMeta): void {
    this.log('debug', message, meta)
  }

  info(message: string, meta?: LogMeta): void {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: LogMeta): void {
    this.log('warn', message, meta)
  }

  error(message: string, meta?: LogMeta): void {
    this.log('error', message, meta)
  }
}

export const logger = new Logger()
