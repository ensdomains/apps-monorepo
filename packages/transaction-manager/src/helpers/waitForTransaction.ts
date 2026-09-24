import type { Hash, TransactionReceipt } from 'viem'
import { transactionManager } from '../providers/transactionManager'
import {
  awaitTransactionOutcome,
  isErrorSnapshot,
  isSuccessSnapshot,
  type ReadOutcome,
} from './awaitTransactionOutcome'

/**
 * Result returned when a transaction completes successfully
 */
export interface WaitForTransactionResult {
  hash: Hash
  receipt?: TransactionReceipt
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

  const read: ReadOutcome<Hash> = (snapshot) => {
    if (snapshot.context.hash) {
      return { settled: true, value: snapshot.context.hash }
    }
    if (isErrorSnapshot(snapshot)) {
      return {
        settled: false,
        error:
          snapshot.context.error ||
          new Error(`Transaction ${txId} failed during submission`),
      }
    }
    return undefined
  }

  return awaitTransactionOutcome(txId, txActor, read)
}

/**
 * Wait for a transaction to complete and return its result.
 *
 * This is a Promise wrapper that subscribes to a transaction actor
 * and resolves on success or rejects on error. Generic helper that
 * works with any transaction managed by transactionManager.
 *
 * @param txId - The transaction ID returned from transactionManager.startTransaction()
 * @returns Promise that resolves with hash and receipt on success
 * @throws Error if transaction not found, fails, or is stopped before completing
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

  const read: ReadOutcome<WaitForTransactionResult> = (snapshot) => {
    const completedHash =
      snapshot.context.receipt?.transactionHash ?? snapshot.context.hash
    if (isSuccessSnapshot(snapshot) && completedHash) {
      return {
        settled: true,
        value: { hash: completedHash, receipt: snapshot.context.receipt },
      }
    }
    if (isErrorSnapshot(snapshot)) {
      return {
        settled: false,
        error:
          snapshot.context.error ||
          new Error(`Transaction ${txId} failed during execution`),
      }
    }
    return undefined
  }

  return awaitTransactionOutcome(txId, txActor, read)
}
