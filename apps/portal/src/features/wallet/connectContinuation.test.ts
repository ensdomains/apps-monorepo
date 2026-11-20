import { describe, expect, it } from 'vitest'
import {
  type ConnectContinuationEvent,
  connectContinuationReducer,
  INITIAL_CONNECT_CONTINUATION,
} from './connectContinuation'

const run = (...events: readonly ConnectContinuationEvent[]) =>
  events.reduce(connectContinuationReducer, INITIAL_CONNECT_CONTINUATION)

describe('connectContinuationReducer', () => {
  it('waits for the app focus trap to leave before reporting an eager connection', () => {
    const closing = run(
      { type: 'open', requestId: 1 },
      { type: 'connected', requestId: 1 },
    )
    expect(closing.status).toBe('settling')
    expect(
      connectContinuationReducer(closing, {
        type: 'surface-closed',
        requestId: 1,
      }),
    ).toEqual({ status: 'ready', requestId: 1, result: 'connected' })
  })

  it('does not treat the WalletConnect chooser handoff or account update as completion before the pairing settles', () => {
    const pairing = run(
      { type: 'open', requestId: 1 },
      { type: 'attempt-started', requestId: 1 },
      { type: 'surface-closed', requestId: 1 },
      { type: 'connected', requestId: 1 },
    )
    expect(pairing.status).toBe('waiting')
    expect(
      connectContinuationReducer(pairing, {
        type: 'attempt-succeeded',
        requestId: 1,
      }),
    ).toEqual({ status: 'ready', requestId: 1, result: 'connected' })
  })

  it('waits for the actual account observation when a connector resolves first', () => {
    const awaitingAccount = run(
      { type: 'open', requestId: 1 },
      { type: 'attempt-started', requestId: 1 },
      { type: 'attempt-succeeded', requestId: 1 },
      { type: 'surface-closed', requestId: 1 },
    )
    expect(awaitingAccount.status).toBe('waiting')
    expect(
      connectContinuationReducer(awaitingAccount, {
        type: 'connected',
        requestId: 1,
      }),
    ).toEqual({ status: 'ready', requestId: 1, result: 'connected' })
  })

  it('reports WalletConnect cancellation after the app chooser already exited', () => {
    expect(
      run(
        { type: 'open', requestId: 1 },
        { type: 'attempt-started', requestId: 1 },
        { type: 'surface-closed', requestId: 1 },
        { type: 'dismissed', requestId: 1 },
      ),
    ).toEqual({ status: 'ready', requestId: 1, result: 'cancelled' })
  })

  it('keeps failed attempts retryable and waits for the reopened app modal to exit again', () => {
    const retry = run(
      { type: 'open', requestId: 1 },
      { type: 'attempt-started', requestId: 1 },
      { type: 'surface-closed', requestId: 1 },
      { type: 'attempt-failed', requestId: 1 },
      { type: 'surface-opened', requestId: 1 },
      { type: 'attempt-started', requestId: 1 },
      { type: 'connected', requestId: 1 },
      { type: 'attempt-succeeded', requestId: 1 },
    )
    expect(retry.status).toBe('settling')
    expect(
      connectContinuationReducer(retry, {
        type: 'surface-closed',
        requestId: 1,
      }),
    ).toEqual({ status: 'ready', requestId: 1, result: 'connected' })
  })

  it('ignores late results from a canceled request, including when a newer intent is active', () => {
    expect(
      run(
        { type: 'open', requestId: 1 },
        { type: 'reset' },
        { type: 'connected', requestId: 1 },
      ),
    ).toEqual(INITIAL_CONNECT_CONTINUATION)
    const latest = run({ type: 'open', requestId: 2 })
    expect(
      connectContinuationReducer(latest, { type: 'dismissed', requestId: 1 }),
    ).toEqual(latest)
  })
})
