import type { Hash, TransactionReceipt } from 'viem'
import { TransactionStoppedError } from '../errors/transaction.errors'
import type { TransactionMachineActor } from '../machines/transaction.types'
import { transactionManager } from '../providers/transactionManager'

/**
 * Result returned when a transaction completes successfully
 */
export interface WaitForTransactionResult {
  hash: Hash
  receipt?: TransactionReceipt
}

/**
 * Subscribe to an actor in a way that always settles.
 *
 * XState delivers a stop through `complete`, not through `next`, so a
 * next-only subscriber learns nothing when its actor is stopped and any
 * promise built on it hangs for the rest of the session. Every waiter here
 * therefore carries `complete` and `error` handlers: whatever happens to the
 * actor, the caller's `await` finishes.
 */
function subscribeUntilSettled<T>(
  txId: string,
  actor: TransactionMachineActor,
  onSnapshot: (
    snapshot: ReturnType<TransactionMachineActor['getSnapshot']>,
    settle: {
      resolve: (value: T) => void
      reject: (reason: unknown) => void
    },
  ) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const subscription = actor.subscribe({
      next: (snapshot) => {
        onSnapshot(snapshot, {
          resolve: (value) => {
            subscription.unsubscribe()
            resolve(value)
          },
          reject: (reason) => {
            subscription.unsubscribe()
            reject(reason)
          },
        })
      },
      // The actor was stopped (retired, cleared, or the app torn down)
      // without reaching a terminal state.
      complete: () => reject(new TransactionStoppedError(txId)),
      error: (error) => reject(error),
    })
  })
}

/**
 * Wait only until a transaction has been submitted and has a hash. This lets
 * callers persist retry metadata before receipt polling completes.
 */
export async function waitForTransactionHash(txId: string): Promise<Hash> {
  const txActor = transactionManager.getTransaction(txId)

  if (!txActor) {
    throw new Error(`Transaction ${txId} not found`)
  }

  const snapshot = txActor.getSnapshot()
  if (snapshot.context.hash) return snapshot.context.hash
  if (typeof snapshot.value === 'object' && 'error' in snapshot.value) {
    throw snapshot.context.error || new Error(`Transaction ${txId} failed`)
  }

  return subscribeUntilSettled<Hash>(txId, txActor, (nextSnapshot, settle) => {
    if (nextSnapshot.context.hash) {
      settle.resolve(nextSnapshot.context.hash)
      return
    }

    if (
      typeof nextSnapshot.value === 'object' &&
      'error' in nextSnapshot.value
    ) {
      settle.reject(
        nextSnapshot.context.error ||
          new Error(`Transaction ${txId} failed during submission`),
      )
    }
  })
}

/**
 * Wait for a transaction to complete and return its result.
 *
 * This is a Promise wrapper that subscribes to a transaction actor
 * and resolves on success or rejects on error. Generic helper that
 * works with any transaction managed by transactionManager.
 *
 * Rejects with {@link TransactionStoppedError} if the actor is stopped before
 * it settles, so a caller is never left waiting on an actor that no longer
 * exists.
 *
 * @param txId - The transaction ID returned from transactionManager.startTransaction()
 * @returns Promise that resolves with hash and receipt on success
 * @throws Error if transaction not found or fails
 *
 * @example
 * ```ts
 * const txId = transactionManager.startTransaction(intent, signer, options)
 * const { hash, receipt } = await waitForTransaction(txId)
 * ```
 */
export async function waitForTransaction(
  txId: string,
): Promise<WaitForTransactionResult> {
  const txActor = transactionManager.getTransaction(txId)

  if (!txActor) {
    throw new Error(`Transaction ${txId} not found`)
  }

  const snapshot = txActor.getSnapshot()
  const completedHash =
    snapshot.context.receipt?.transactionHash ?? snapshot.context.hash

  // Already complete?
  if (
    (snapshot.matches?.('success' as never) || snapshot.value === 'success') &&
    completedHash
  ) {
    return {
      hash: completedHash,
      receipt: snapshot.context.receipt,
    }
  }

  // Already failed?
  if (typeof snapshot.value === 'object' && 'error' in snapshot.value) {
    throw snapshot.context.error || new Error(`Transaction ${txId} failed`)
  }

  // Subscribe and wait
  return subscribeUntilSettled<WaitForTransactionResult>(
    txId,
    txActor,
    (nextSnapshot, settle) => {
      const nextHash =
        nextSnapshot.context.receipt?.transactionHash ??
        nextSnapshot.context.hash
      if (
        (nextSnapshot.matches?.('success' as never) ||
          nextSnapshot.value === 'success') &&
        nextHash
      ) {
        settle.resolve({
          hash: nextHash,
          receipt: nextSnapshot.context.receipt,
        })
        return
      }

      if (
        typeof nextSnapshot.value === 'object' &&
        'error' in nextSnapshot.value
      ) {
        settle.reject(
          nextSnapshot.context.error ||
            new Error(`Transaction ${txId} failed during execution`),
        )
      }
    },
  )
}
