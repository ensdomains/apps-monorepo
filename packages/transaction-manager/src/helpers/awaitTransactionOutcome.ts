import type { ActorRefFrom } from 'xstate'
import { TransactionStoppedError } from '../errors/transaction.errors'
import type { transactionMachine } from '../machines/transaction.machine'

export type TransactionActor = ActorRefFrom<typeof transactionMachine>
export type TransactionSnapshot = ReturnType<TransactionActor['getSnapshot']>

/** A terminal read of a snapshot: a value to resolve with, or a reason to reject. */
export type TransactionOutcome<T> =
  | { readonly settled: true; readonly value: T }
  | { readonly settled: false; readonly error: unknown }

/**
 * Returns the terminal outcome for `snapshot`, or `undefined` while the
 * transaction is still in flight.
 */
export type ReadOutcome<T> = (
  snapshot: TransactionSnapshot,
) => TransactionOutcome<T> | undefined

/** True for the machine's nested `error.*` states (`error.submission`, …). */
export function isErrorSnapshot(snapshot: TransactionSnapshot): boolean {
  return typeof snapshot.value === 'object' && 'error' in snapshot.value
}

/** True for the machine's `success` state, across both snapshot shapes. */
export function isSuccessSnapshot(snapshot: TransactionSnapshot): boolean {
  return (
    snapshot.matches?.('success' as never) === true ||
    snapshot.value === 'success'
  )
}

/**
 * Await a transaction actor's terminal state as a promise.
 *
 * Every caller that awaits a transaction actor has to handle three ways the
 * wait can end, and missing any one of them hangs the promise forever:
 *
 * 1. **Already terminal.** xstate only emits on *transitions*, so an actor
 *    that reached `success`/`error.*` before we subscribe never emits again.
 *    `read` is applied to the current snapshot first.
 * 2. **Stopped while subscribed.** `Actor._complete()` calls
 *    `observer.complete?.()` on every observer when the actor is stopped —
 *    `transactionManager.clear()` and `clearAllAndPersistence()` do this on
 *    account switch and disconnect. A subscriber with only a `next` handler
 *    is simply dropped.
 * 3. **Actor-level failure.** `error` settles rather than going unhandled.
 *
 * Subscribing to an already-stopped actor would register nothing and emit
 * nothing, but callers look the actor up and subscribe in one synchronous
 * block, so it cannot be stopped in between.
 */
export function awaitTransactionOutcome<T>(
  txId: string,
  actor: TransactionActor,
  read: ReadOutcome<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    // Left undefined while `subscribe()` is still running: xstate can invoke
    // `complete` synchronously from inside it, before this is assigned.
    let subscription: { unsubscribe: () => void } | undefined

    const settle = (outcome: TransactionOutcome<T>) => {
      if (done) return
      done = true
      subscription?.unsubscribe()
      if (outcome.settled) resolve(outcome.value)
      else reject(outcome.error)
    }

    const current = read(actor.getSnapshot())
    if (current) {
      settle(current)
      return
    }

    subscription = actor.subscribe({
      next: (snapshot) => {
        const outcome = read(snapshot)
        if (outcome) settle(outcome)
      },
      error: (error) => settle({ settled: false, error }),
      complete: () =>
        // A terminal snapshot can land in the same macrostep that stops the
        // actor, so prefer it over reporting the stop.
        settle(
          read(actor.getSnapshot()) ?? {
            settled: false,
            error: new TransactionStoppedError(txId),
          },
        ),
    })

    if (done) subscription.unsubscribe()
  })
}
