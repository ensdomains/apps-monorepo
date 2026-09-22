import type { Hash, TransactionReceipt } from 'viem'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTransaction: vi.fn(),
}))

vi.mock('../providers/transactionManager', () => ({
  transactionManager: { getTransaction: mocks.getTransaction },
}))

import { TransactionStoppedError } from '../errors/transaction.errors'
import {
  waitForTransaction,
  waitForTransactionHash,
} from './waitForTransaction'

const HASH = `0x${'1'.repeat(64)}` as Hash
const REPLACEMENT_HASH = `0x${'2'.repeat(64)}` as Hash
const REPLACEMENT_RECEIPT = {
  transactionHash: REPLACEMENT_HASH,
} as TransactionReceipt

type ActorSnapshot = {
  context: { hash?: Hash; receipt?: TransactionReceipt }
  value: string | { error: string }
}

type Observer = {
  next?: (snapshot: ActorSnapshot) => void
  error?: (error: unknown) => void
  complete?: () => void
}

/**
 * Stands in for an actor. The waiters subscribe with an observer, because
 * XState reports a stop through `complete` and a next-only subscriber would
 * never learn the actor went away.
 */
function mockActor(initial: ActorSnapshot) {
  const unsubscribe = vi.fn()
  let observer: Observer | undefined

  mocks.getTransaction.mockReturnValueOnce({
    getSnapshot: () => initial,
    subscribe: (next: Observer) => {
      observer = next
      return { unsubscribe }
    },
  })

  return {
    unsubscribe,
    emit: (snapshot: ActorSnapshot) => observer?.next?.(snapshot),
    stop: () => observer?.complete?.(),
    fail: (error: unknown) => observer?.error?.(error),
  }
}

describe('waitForTransactionHash', () => {
  it('returns an already-submitted hash immediately', async () => {
    mocks.getTransaction.mockReturnValueOnce({
      getSnapshot: () => ({ context: { hash: HASH }, value: 'waitForReceipt' }),
    })

    await expect(waitForTransactionHash('tx-1')).resolves.toBe(HASH)
  })

  it('resolves as soon as the transaction actor publishes a hash', async () => {
    const actor = mockActor({ context: {}, value: 'submitting' })

    const submitted = waitForTransactionHash('tx-2')
    actor.emit({ context: { hash: HASH }, value: 'waitForReceipt' })

    await expect(submitted).resolves.toBe(HASH)
    expect(actor.unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects when the actor is stopped before a hash arrives', async () => {
    const actor = mockActor({ context: {}, value: 'submitting' })

    const submitted = waitForTransactionHash('tx-2b')
    actor.stop()

    await expect(submitted).rejects.toBeInstanceOf(TransactionStoppedError)
  })
})

describe('waitForTransaction', () => {
  it('returns a replacement hash from an already-complete receipt', async () => {
    mocks.getTransaction.mockReturnValueOnce({
      getSnapshot: () => ({
        context: { hash: HASH, receipt: REPLACEMENT_RECEIPT },
        value: 'success',
      }),
    })

    await expect(waitForTransaction('tx-3')).resolves.toEqual({
      hash: REPLACEMENT_HASH,
      receipt: REPLACEMENT_RECEIPT,
    })
  })

  it('returns a replacement hash when the successful snapshot publishes its receipt', async () => {
    const actor = mockActor({ context: { hash: HASH }, value: 'pending' })

    const completed = waitForTransaction('tx-4')
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
    // Otherwise the caller's mutation stays pending for the rest of the
    // session: no invalidation, no history entry, no error — while the
    // transaction itself may well be on-chain.
    const actor = mockActor({ context: { hash: HASH }, value: 'pending' })

    const completed = waitForTransaction('tx-5')
    actor.stop()

    await expect(completed).rejects.toBeInstanceOf(TransactionStoppedError)
  })

  it('rejects when the actor itself errors', async () => {
    const actor = mockActor({ context: {}, value: 'submitting' })
    const boom = new Error('actor blew up')

    const completed = waitForTransaction('tx-6')
    actor.fail(boom)

    await expect(completed).rejects.toBe(boom)
  })

  it('ignores a later stop once it has already settled', async () => {
    const actor = mockActor({ context: { hash: HASH }, value: 'pending' })

    const completed = waitForTransaction('tx-7')
    actor.emit({ context: { hash: HASH }, value: 'success' })
    actor.stop()

    await expect(completed).resolves.toEqual({
      hash: HASH,
      receipt: undefined,
    })
  })
})
