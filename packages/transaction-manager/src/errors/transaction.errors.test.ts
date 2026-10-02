/**
 * Tests for orchestrator-error unwrapping on TransactionSubmissionError.
 *
 * The Rhinestone SDK throws plain `Error` instances with extra enumerable
 * fields (`context`, `errorType`, `traceId`, `statusCode`, `simulations`)
 * that don't survive a `.message`-only round-trip. These tests pin down
 * the contract that those fields are both:
 *   1. lifted onto `error.orchestrator` (programmatic access), and
 *   2. summarized into `error.message` (single-line logs / DX).
 */

import { BaseError, UserRejectedRequestError } from 'viem'
import { describe, expect, it } from 'vitest'
import type { TransactionRequest } from '../types/transaction.types'
import {
  extractOrchestratorErrorContext,
  isUserRejectionError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from './transaction.errors'

const dummyRequest = {
  type: 'rhinestone-intent',
} as unknown as TransactionRequest

describe('extractOrchestratorErrorContext', () => {
  it('returns an empty object for non-object inputs', () => {
    expect(extractOrchestratorErrorContext(null)).toEqual({})
    expect(extractOrchestratorErrorContext(undefined)).toEqual({})
    expect(extractOrchestratorErrorContext('boom')).toEqual({})
    expect(extractOrchestratorErrorContext(42)).toEqual({})
  })

  it('returns only `name` for an Error without orchestrator fields', () => {
    // Every Error has a non-empty `name` so the extractor surfaces it
    // (knowing the thrown class is useful even when nothing else is set).
    expect(extractOrchestratorErrorContext(new Error('plain'))).toEqual({
      name: 'Error',
    })
  })

  it('lifts each known field with correct typing', () => {
    const sdkError = Object.assign(new Error('Bundle simulation failed'), {
      errorType: 'Bad Request',
      traceId: '591ce448ed09d2e490181848970c5c2f',
      statusCode: 400,
      context: { detail: 'something' },
      simulations: undefined,
    })

    expect(extractOrchestratorErrorContext(sdkError)).toEqual({
      name: 'Error',
      errorType: 'Bad Request',
      traceId: '591ce448ed09d2e490181848970c5c2f',
      statusCode: 400,
      context: { detail: 'something' },
      // `simulations: undefined` is preserved as `undefined` (the key
      // exists with a non-string value) so callers can distinguish
      // "orchestrator did not run sims" from "no field at all".
      simulations: undefined,
    })
  })

  it('drops fields with wrong types instead of coercing', () => {
    const malformed = Object.assign(new Error('x'), {
      statusCode: '400', // string, not number
      traceId: 12345, // number, not string
    })
    expect(extractOrchestratorErrorContext(malformed)).toEqual({
      name: 'Error',
    })
  })
})

describe('TransactionSubmissionError', () => {
  it('inlines orchestrator fields into the message', () => {
    const sdkError = Object.assign(new Error('Bundle simulation failed'), {
      errorType: 'Bad Request',
      traceId: 'trace-abc',
      statusCode: 400,
      context: { reason: 'nonce mismatch' },
    })

    const err = new TransactionSubmissionError(dummyRequest, sdkError)

    expect(err.message).toContain('Failed to submit transaction')
    expect(err.message).toContain('Bundle simulation failed')
    expect(err.message).toContain('errorType=Bad Request')
    expect(err.message).toContain('statusCode=400')
    expect(err.message).toContain('traceId=trace-abc')
    expect(err.message).toContain('context={"reason":"nonce mismatch"}')
  })

  it('exposes orchestrator fields on `.orchestrator`', () => {
    const sdkError = Object.assign(new Error('Bundle simulation failed'), {
      errorType: 'Bad Request',
      statusCode: 400,
      context: { reason: 'x' },
    })

    const err = new TransactionSubmissionError(dummyRequest, sdkError)

    expect(err.orchestrator).toMatchObject({
      errorType: 'Bad Request',
      statusCode: 400,
      context: { reason: 'x' },
    })
  })

  it('serializes bigints inside `context` without throwing', () => {
    const sdkError = Object.assign(new Error('sim failed'), {
      context: { gasUsed: 21000n, nonce: 7n },
    })

    const err = new TransactionSubmissionError(dummyRequest, sdkError)

    expect(err.message).toContain('"gasUsed":"21000"')
    expect(err.message).toContain('"nonce":"7"')
  })

  it('falls back gracefully when `context` is not JSON-serializable', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const sdkError = Object.assign(new Error('weird'), { context: circular })

    const err = new TransactionSubmissionError(dummyRequest, sdkError)

    // The constructor MUST NOT throw on a circular context — it should
    // fall back to `String(ctx.context)` which yields `[object Object]`.
    expect(err.message).toContain('context=[object Object]')
    expect(err.orchestrator.context).toBe(circular)
  })

  it('preserves the original cause for downstream consumers', () => {
    const sdkError = new Error('Bundle simulation failed')
    const err = new TransactionSubmissionError(dummyRequest, sdkError)
    expect(err.cause).toBe(sdkError)
  })

  it('handles non-Error causes', () => {
    const err = new TransactionSubmissionError(dummyRequest, 'string boom')
    expect(err.message).toBe('Failed to submit transaction')
    expect(err.orchestrator).toEqual({})
  })

  it('handles no cause', () => {
    const err = new TransactionSubmissionError(dummyRequest)
    expect(err.message).toBe('Failed to submit transaction')
    expect(err.orchestrator).toEqual({})
  })
})

describe('isUserRejectionError', () => {
  const declined = () =>
    new UserRejectedRequestError(new Error('User rejected the request.'))

  /**
   * What a rejection looks like when it was thrown by ANOTHER viem copy, as the
   * app's wallet client's are whenever pnpm splits viem: the same `name`, but
   * no instance of any class this package imports.
   */
  const declinedByOtherViemCopy = () =>
    Object.assign(new Error('User rejected the request.'), {
      name: 'UserRejectedRequestError',
      code: 4001,
    })

  it('recognises a transaction declined in the EOA transport', () => {
    expect(
      isUserRejectionError(
        new TransactionUserRejectedError(dummyRequest, declined()),
      ),
    ).toBe(true)
  })

  it('recognises a declined signature, however deep viem wrapped it', () => {
    expect(isUserRejectionError(declined())).toBe(true)
    expect(
      isUserRejectionError(
        new BaseError('Signing failed', { cause: declined() }),
      ),
    ).toBe(true)
  })

  it('recognises a rejection thrown by another viem copy', () => {
    // An `instanceof` check misses exactly these.
    expect(isUserRejectionError(declinedByOtherViemCopy())).toBe(true)
    expect(
      isUserRejectionError(
        Object.assign(new Error('Transaction execution error'), {
          name: 'TransactionExecutionError',
          cause: declinedByOtherViemCopy(),
        }),
      ),
    ).toBe(true)
  })

  it('reaches a rejection through our own wrappers', () => {
    expect(
      isUserRejectionError(
        new TransactionSubmissionError(dummyRequest, declinedByOtherViemCopy()),
      ),
    ).toBe(true)
  })

  it('does not mistake other failures for a rejection', () => {
    expect(isUserRejectionError(new Error('rpc down'))).toBe(false)
    expect(isUserRejectionError(new BaseError('execution reverted'))).toBe(
      false,
    )
    expect(
      isUserRejectionError(
        new TransactionSubmissionError(dummyRequest, new Error('sim failed')),
      ),
    ).toBe(false)
    expect(isUserRejectionError(undefined)).toBe(false)
  })
})
