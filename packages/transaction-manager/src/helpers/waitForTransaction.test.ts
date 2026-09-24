import type { Hash, TransactionReceipt } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { TransactionStoppedError } from '../errors/transaction.errors'

const mocks = vi.hoisted(() => ({
  getTransaction: vi.fn(),
}))

vi.mock('../providers/transactionManager', () => ({
  transactionManager: { getTransaction: mocks.getTransaction },
}))

import {
  waitForTransaction,
  waitForTransactionHash,
} from './waitForTransaction'

const HASH = `0x${'1'.repeat(64)}` as Hash
const REPLACEMENT_HASH = `0x${'2'.repeat(64)}` as Hash
const REPLACEMENT_RECEIPT = {
  transactionHash: REPLACEMENT_HASH,
} as TransactionReceipt

type FakeSnapshot = {
  context: {
    hash?: Hash
    receipt?: TransactionReceipt
    error?: Error
  }
  value: string | { error: string }
}

type FakeObserver = {
  next?: (snapshot: FakeSnapshot) => void
  error?: (error: unknown) => void
  complete?: () => void
}

/**
 * Stands in for an xstate transaction actor. `stop()` mirrors
 * `Actor._complete()`: every observer's `complete` is invoked, and the
 * snapshot keeps whatever non-terminal value it had.
 */
function fakeActor(initial: FakeSnapshot) {
  let snapshot = initial
  let observer: FakeObserver | undefined
  const unsubscribe = vi.fn(() => {
    observer = undefined
  })

  return {
    unsubscribe,
    getSnapshot: () => snapshot,
    subscribe: (next: FakeObserver) => {
      observer = next
      return { unsubscribe }
    },
    emit(nextSnapshot: FakeSnapshot) {
      snapshot = nextSnapshot
      observer?.next?.(nextSnapshot)
    },
    /** Stop without reaching a terminal state, as `clear()` does. */
    stop() {
      observer?.complete?.()
    },
    /** Fail at the actor level rather than through a machine error state. */
    fail(error: unknown) {
      observer?.error?.(error)
    },
  }
}

describe('waitForTransactionHash', () => {
  it('returns an already-submitted hash immediately', async () => {
    mocks.getTransaction.mockReturnValueOnce(
      fakeActor({ context: { hash: HASH }, value: 'waitForReceipt' }),
    )

    await expect(waitForTransactionHash('tx-1')).resolves.toBe(HASH)
  })

  it('resolves as soon as the transaction actor publishes a hash', async () => {
    const actor = fakeActor({ context: {}, value: 'submitting' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const submitted = waitForTransactionHash('tx-2')
    actor.emit({ context: { hash: HASH }, value: 'waitForReceipt' })

    await expect(submitted).resolves.toBe(HASH)
    expect(actor.unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects when the actor is stopped before a hash arrives', async () => {
    const actor = fakeActor({ context: {}, value: 'submitting' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const submitted = waitForTransactionHash('tx-3')
    actor.stop()

    await expect(submitted).rejects.toBeInstanceOf(TransactionStoppedError)
  })
})

describe('waitForTransaction', () => {
  it('returns a replacement hash from an already-complete receipt', async () => {
    mocks.getTransaction.mockReturnValueOnce(
      fakeActor({
        context: { hash: HASH, receipt: REPLACEMENT_RECEIPT },
        value: 'success',
      }),
    )

    await expect(waitForTransaction('tx-4')).resolves.toEqual({
      hash: REPLACEMENT_HASH,
      receipt: REPLACEMENT_RECEIPT,
    })
  })

  it('returns a replacement hash when the successful snapshot publishes its receipt', async () => {
    const actor = fakeActor({ context: { hash: HASH }, value: 'pending' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const completed = waitForTransaction('tx-5')
    actor.emit({
      context: { hash: HASH, receipt: REPLACEMENT_RECEIPT },
      value: 'success',
    })

    await expect(completed).resolves.toEqual({
      hash: REPLACEMENT_HASH,
      receipt: REPLACEMENT_RECEIPT,
    })
    expect(actor.unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects when the actor is stopped mid-flight', async () => {
    const actor = fakeActor({ context: { hash: HASH }, value: 'pending' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const completed = waitForTransaction('tx-6')
    actor.stop()

    await expect(completed).rejects.toBeInstanceOf(TransactionStoppedError)
  })

  it('reports the terminal snapshot when success and stop land together', async () => {
    const actor = fakeActor({ context: { hash: HASH }, value: 'pending' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const completed = waitForTransaction('tx-7')
    // The machine reached success but `next` has not been dispatched yet.
    Object.assign(actor, {
      getSnapshot: () => ({
        context: { hash: HASH, receipt: REPLACEMENT_RECEIPT },
        value: 'success',
      }),
    })
    actor.stop()

    await expect(completed).resolves.toEqual({
      hash: REPLACEMENT_HASH,
      receipt: REPLACEMENT_RECEIPT,
    })
  })

  it('rejects with the machine error for an already-failed transaction', async () => {
    const error = new Error('reverted')
    mocks.getTransaction.mockReturnValueOnce(
      fakeActor({ context: { error }, value: { error: 'reverted' } }),
    )

    await expect(waitForTransaction('tx-8')).rejects.toBe(error)
  })
  it('rejects when the actor itself errors', async () => {
    const actor = fakeActor({ context: {}, value: 'submitting' })
    mocks.getTransaction.mockReturnValueOnce(actor)
    const boom = new Error('actor blew up')

    const completed = waitForTransaction('tx-9')
    actor.fail(boom)

    await expect(completed).rejects.toBe(boom)
  })

  it('ignores a later stop once it has already settled', async () => {
    const actor = fakeActor({ context: { hash: HASH }, value: 'pending' })
    mocks.getTransaction.mockReturnValueOnce(actor)

    const completed = waitForTransaction('tx-10')
    actor.emit({ context: { hash: HASH }, value: 'success' })
    actor.stop()

    await expect(completed).resolves.toEqual({
      hash: HASH,
      receipt: undefined,
    })
  })
})
