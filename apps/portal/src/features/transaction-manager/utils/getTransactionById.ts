import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'

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

export const getTransactionById = (
  transactions: readonly Transaction[],
  transactionId: string,
): Transaction => {
  const tx = transactions.find(
    (transaction) => transaction.id === transactionId,
  )

  if (!tx) {
    throw new Error(`Transaction with id ${transactionId} not found`)
  }

  return tx
}
