import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getTransactionById } from './getTransactionById'

/**
 * Returns the active transaction: the one matching txState when present,
 * otherwise the first transaction in the flow.
 */
export const getActiveTransaction = (
  transactions: readonly Transaction[],
  txState: ActiveTransactionState | undefined,
): Transaction => {
  if (txState) {
    return getTransactionById(transactions, txState.txId)
  }

  if (transactions.length === 0) {
    throw new Error('No transactions provided')
  }

  return transactions[0]
}
