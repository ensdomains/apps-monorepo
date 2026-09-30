import type { TransactionReceipt } from 'viem'
import { transactionManager } from '../providers/transactionManager'
import {
  awaitTransactionOutcome,
  isErrorSnapshot,
  isSuccessSnapshot,
  type ReadOutcome,
} from './awaitTransactionOutcome'

/**
 * Wait for a transaction to complete and return its receipt.
 * Subscribes to the transaction actor and resolves when successful.
 *
 * @throws Error if transaction not found, fails, or is stopped before completing
 */
export async function waitForTransactionReceiptById(
  txId: string,
): Promise<TransactionReceipt> {
  const txActor = transactionManager.getTransaction(txId)

  if (!txActor) {
    throw new Error(`Transaction ${txId} not found`)
  }

  const read: ReadOutcome<TransactionReceipt> = (snapshot) => {
    if (isSuccessSnapshot(snapshot) && snapshot.context.receipt) {
      return { settled: true, value: snapshot.context.receipt }
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
