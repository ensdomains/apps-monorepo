import { describe, expect, it, vi } from 'vitest'
import { TransactionAbandonedError } from '../../errors/transaction.errors'

const mocks = vi.hoisted(() => ({
  getTransaction: vi.fn(),
}))

vi.mock('../../providers/transactionManager', () => ({
  transactionManager: { getTransaction: mocks.getTransaction },
}))

import { pollTransactionStatusActor } from './registration.actors'

type FakeSnapshot = {
  context: { error?: Error }
  value: string | { error: string }
}

type FakeObserver = {
  next?: (snapshot: FakeSnapshot) => void
  error?: (error: unknown) => void
  complete?: () => void
}

function fakeActor(initial: FakeSnapshot) {
  let snapshot = initial
  let observer: FakeObserver | undefined

  return {
    getSnapshot: () => snapshot,
    subscribe: (next: FakeObserver) => {
      observer = next
      return {
        unsubscribe: () => {
          observer = undefined
        },
      }
    },
    emit(nextSnapshot: FakeSnapshot) {
      snapshot = nextSnapshot
      observer?.next?.(nextSnapshot)
    },
    stop() {
      observer?.complete?.()
    },
  }
}

describe('pollTransactionStatusActor', () => {
  it('errors when the transaction is not registered', async () => {
    mocks.getTransaction.mockReturnValueOnce(undefined)

    const result = await pollTransactionStatusActor({ txId: 'tx-missing' })

    expect(result.isErr()).toBe(true)
  })

  // xstate only emits on transitions, so an actor that is already terminal
  // when we attach never emits again. Bulk renew attaches after submission,
  // which is how the UI got stuck at "Waiting for renewal".
  it('settles from the current snapshot when the actor is already successful', async () => {
    mocks.getTransaction.mockReturnValueOnce(
      fakeActor({ context: {}, value: 'success' }),
    )

    const result = await pollTransactionStatusActor({ txId: 'tx-done' })

    expect(result.isOk()).toBe(true)
  })

  it('settles from the current snapshot when the actor has already failed', async () => {
    const error = new Error('reverted')
    mocks.getTransaction.mockReturnValueOnce(
      fakeActor({ context: { error }, value: { error: 'reverted' } }),
    )

    const result = await pollTransactionStatusActor({ txId: 'tx-failed' })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe(error)
  })

  it('resolves when the actor transitions to success', async () => {
    const actor = fakeActor({ context: {}, value: 'pending' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const polled = pollTransactionStatusActor({ txId: 'tx-live' })
    actor.emit({ context: {}, value: 'success' })

    expect((await polled).isOk()).toBe(true)
  })

  // `clearAllAndPersistence()` stops every live actor on account switch, which
  // used to leave the registration machine waiting on a promise that never
  // settled — no on-chain fallback, no error, a permanent spinner.
  it('errors when the actor is stopped before reaching a terminal state', async () => {
    const actor = fakeActor({ context: {}, value: 'pending' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const polled = pollTransactionStatusActor({ txId: 'tx-stopped' })
    actor.stop()

    const result = await polled
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionAbandonedError)
  })
})
