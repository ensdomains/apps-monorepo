/* Structured logger for Cloudflare Workers */
export interface LogMeta {
  [key: string]: unknown
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']
const DEV_ONLY_LEVELS = new Set<LogLevel>(['trace', 'debug'])

const isDevelopment = (): boolean => {
  return Boolean(import.meta.env.DEV || import.meta.env.MODE === 'development')
}

// prettify errors
export function prettifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message
  }

  return String(error)
}

export class Logger {
  private readonly isDev = isDevelopment()

  private shouldLog(level: LogLevel): boolean {
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
    const seen = new WeakSet<object>()
    return JSON.stringify(entry, (_key, value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }

      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        }
      }

      if (value && typeof value === 'object') {
        if (seen.has(value)) {
          return '[circular]'
        }
        seen.add(value)
      }

      return value
    })
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
