import { useEffect } from 'react'
import type { Transaction } from '../types'

/**
 * Automatically calls `onDone` on the currently active transaction when it
 * succeeds, advancing the flow to the next transaction in the sequence.
 *
 * @param autoAdvanceTxId - The ID of the transaction to advance from, or null
 *   if auto-advance is not applicable (e.g. modal is closed or tx not yet done).
 * @param transactions - The ordered list of transactions in the current flow.
 */
export function useAutoAdvanceTransaction(
  autoAdvanceTxId: string | null,
  transactions: readonly Transaction[],
): void {
  useEffect(() => {
    if (!autoAdvanceTxId) return

    const activeIndex = transactions.findIndex(
      (tx) => tx.id === autoAdvanceTxId,
    )
    if (activeIndex < 0 || activeIndex >= transactions.length - 1) return

    transactions[activeIndex].onDone()
  }, [autoAdvanceTxId, transactions])
}
