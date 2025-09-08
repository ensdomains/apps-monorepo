/* Structured logger for Cloudflare Workers */
export interface LogMeta {
  [key: string]: any
}

// prettify errors
export function prettifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message
  }

  return String(error)
}

export class Logger {
  log(level: string, message: string, meta?: LogMeta): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    }
    console.log(JSON.stringify(logEntry))
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
