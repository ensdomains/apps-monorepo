import { describe, expect, it, vi } from 'vitest'
import {
  type ErrorLike,
  formatHumanLog,
  getErrorCause,
  isErrorLike,
  logger,
  serializeError,
  serializeLogValue,
} from './logger.js'

describe('logger helper functions', () => {
  it('identifies real Error instances as error-like', () => {
    expect(isErrorLike(new Error('boom'))).toBe(true)
  })

  it('does not treat plain log-like objects as errors', () => {
    expect(
      isErrorLike({
        message: 'normal log message',
        name: 'alpha.eth',
      }),
    ).toBe(false)
  })

  it('extracts direct object causes', () => {
    const cause = new Error('inner')
    const error = new Error('outer', { cause })

    expect(getErrorCause(error)).toBe(cause)
  })

  it('extracts non-error causes without dropping them', () => {
    const error = new Error('outer', { cause: 'inner context' })

    expect(getErrorCause(error)).toBe('inner context')
  })

  it('extracts function-style causes', () => {
    const cause = new Error('inner')
    const errorWithCauseFn = {
      message: 'outer',
      stack: 'stack',
      cause() {
        return cause
      },
    }

    expect(getErrorCause(errorWithCauseFn)).toBe(cause)
  })

  it('returns undefined when cause function throws', () => {
    const throwingCause = {
      message: 'outer',
      stack: 'stack',
      cause() {
        throw new Error('failed')
      },
    }

    expect(getErrorCause(throwingCause)).toBeUndefined()
  })
})

describe('logger serializers', () => {
  it('returns non-error values unchanged in serializeError', () => {
    expect(serializeError('boom')).toBe('boom')
    expect(serializeError(123)).toBe(123)
  })

  it('serializes a plain Error with type, message, and stack', () => {
    const error = new Error('boom')

    const serialized = serializeError(error) as Record<string, unknown>

    expect(serialized.type).toBe('Error')
    expect(serialized.message).toBe('boom')
    expect(typeof serialized.stack).toBe('string')
  })

  it('serializes nested causes as a structured cause tree', () => {
    const cause = new Error('root cause')
    const error = new Error('outer error', { cause })

    const serialized = serializeError(error) as {
      cause?: { message?: string; type?: string }
      message?: string
    }

    expect(serialized.message).toBe('outer error')
    expect(serialized.cause?.type).toBe('Error')
    expect(serialized.cause?.message).toBe('root cause')
  })

  it('serializes non-error causes instead of dropping them', () => {
    const error = new Error('outer', {
      cause: { code: 'E_CONTEXT', retry: true },
    })

    const serialized = serializeError(error) as {
      cause?: { code?: string; retry?: boolean }
    }

    expect(serialized.cause?.code).toBe('E_CONTEXT')
    expect(serialized.cause?.retry).toBe(true)
  })

  it('supports function-style causes', () => {
    const errorWithFunctionCause: ErrorLike = {
      name: 'OuterError',
      message: 'outer',
      stack: 'outer-stack',
      cause() {
        return new Error('inner')
      },
    }

    const serialized = serializeError(errorWithFunctionCause) as {
      cause?: { message?: string; type?: string }
    }

    expect(serialized.cause?.type).toBe('Error')
    expect(serialized.cause?.message).toBe('inner')
  })

  it('serializes aggregate errors', () => {
    const error = new AggregateError([new Error('a'), new Error('b')], 'agg')

    const serialized = serializeError(error) as {
      aggregateErrors?: Array<{ message?: string }>
    }

    expect(serialized.aggregateErrors).toHaveLength(2)
    expect(serialized.aggregateErrors?.[0]?.message).toBe('a')
    expect(serialized.aggregateErrors?.[1]?.message).toBe('b')
  })

  it('preserves enumerable custom fields on errors', () => {
    const error = new Error('boom') as Error & {
      code?: string
      details?: { requestId: string }
    }
    error.code = 'E_BANG'
    error.details = {
      requestId: 'req-1',
    }

    const serialized = serializeError(error) as {
      code?: string
      details?: { requestId?: string }
    }

    expect(serialized.code).toBe('E_BANG')
    expect(serialized.details?.requestId).toBe('req-1')
  })

  it('guards against circular error causes', () => {
    const error = new Error('boom') as Error & { cause?: unknown }
    error.cause = error

    const serialized = serializeError(error) as {
      cause?: { circular?: boolean; message?: string }
    }

    expect(serialized.cause?.circular).toBe(true)
    expect(serialized.cause?.message).toBe('boom')
  })

  it('keeps raw as a non-enumerable reference', () => {
    const error = new Error('boom')
    const serialized = serializeError(error) as Record<string, unknown> & {
      raw?: unknown
    }

    expect(serialized.raw).toBe(error)
    expect(Object.keys(serialized)).not.toContain('raw')
    expect(JSON.stringify(serialized)).not.toContain('"raw"')
  })

  it('serializes bigint values to strings', () => {
    expect(serializeLogValue(10n)).toBe('10')
  })

  it('normalizes non-finite numbers to null', () => {
    expect(serializeLogValue(Number.NaN)).toBeNull()
    expect(serializeLogValue(Number.POSITIVE_INFINITY)).toBeNull()
    expect(serializeLogValue(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('serializes Date values and handles invalid dates safely', () => {
    expect(serializeLogValue(new Date('2023-01-02T03:04:05.000Z'))).toBe(
      '2023-01-02T03:04:05.000Z',
    )
    expect(() => serializeLogValue(new Date('not-a-date'))).not.toThrow()
    expect(serializeLogValue(new Date('not-a-date'))).toBeNull()
  })

  it('drops undefined, function, and symbol object values', () => {
    const serialized = serializeLogValue({
      ok: 'yes',
      skipUndefined: undefined,
      skipFunction: () => 'no',
      skipSymbol: Symbol('s'),
    }) as Record<string, unknown>

    expect(serialized).toEqual({
      ok: 'yes',
    })
  })

  it('replaces circular object references with [circular]', () => {
    const input: Record<string, unknown> = {
      count: 1n,
    }
    input.self = input

    const serialized = serializeLogValue(input) as Record<string, unknown>

    expect(serialized.count).toBe('1')
    expect(serialized.self).toBe('[circular]')
  })
})

describe('formatHumanLog', () => {
  it('renders a compact header for logs without meta', () => {
    const formatted = formatHumanLog(
      {
        timestamp: '2026-08-24T12:22:01.441Z',
        level: 'info',
        message: 'Delivery job queued',
      },
      { color: false },
    )

    const [header, ...rest] = formatted.split('\n')
    expect(header).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}/)
    expect(header).toContain('INFO')
    expect(header).toContain('Delivery job queued')
    expect(rest).toEqual([])
  })

  it('pretty-prints nested meta, arrays, and stack traces', () => {
    const formatted = formatHumanLog(
      {
        timestamp: '2026-08-24T12:22:01.441Z',
        level: 'error',
        message: 'Internal server error',
        path: '/notifications',
        retry: false,
        attempts: 3,
        tags: ['email', 'expiry'],
        error: {
          type: 'TypeError',
          message: 'boom',
          stack: 'TypeError: boom\n    at handleRequest (index.ts:33:5)',
        },
        jobs: [{ id: 'job-1' }, { id: 'job-2' }],
      },
      { color: false },
    )

    expect(formatted).toContain('ERROR  Internal server error')
    expect(formatted).toContain('    path: /notifications')
    expect(formatted).toContain('    retry: false')
    expect(formatted).toContain('    attempts: 3')
    expect(formatted).toContain('    tags: [email, expiry]')
    expect(formatted).toContain('    error:')
    expect(formatted).toContain('      type: TypeError')
    expect(formatted).toContain('      message: boom')
    expect(formatted).toContain('      stack:')
    expect(formatted).toContain('        TypeError: boom')
    expect(formatted).toContain('            at handleRequest (index.ts:33:5)')
    expect(formatted).toContain('    jobs:')
    expect(formatted).toContain('      - id: job-1')
    expect(formatted).toContain('      - id: job-2')
  })

  it('includes ansi colors when enabled', () => {
    const formatted = formatHumanLog(
      {
        timestamp: '2026-08-24T12:22:01.441Z',
        level: 'warn',
        message: 'Retrying indexer request',
        status: 503,
      },
      { color: true },
    )

    expect(formatted).toContain('\x1b[')
    expect(formatted).toContain('Retrying indexer request')
    expect(formatted).toContain('status')
  })
})

describe('Logger output', () => {
  it('emits single-line json outside development', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.info('hello', { count: 1n })

    expect(spy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      level?: string
      message?: string
      count?: string
    }
    expect(payload.level).toBe('info')
    expect(payload.message).toBe('hello')
    expect(payload.count).toBe('1')

    spy.mockRestore()
  })
})
