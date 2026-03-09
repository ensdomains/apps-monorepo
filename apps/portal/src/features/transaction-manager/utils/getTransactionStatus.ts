import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'

export const getTransactionStatus = (
  txState: ActiveTransactionState | undefined,
  transaction: Transaction | undefined,
): TransactionMachineState | undefined => {
  if (txState && transaction && txState.txId === transaction.id) {
    if (txState.error) {
      return 'error'
    }

    return txState.machineState
  }
}

/**
 * Gets status for a transaction within a sequential multi-transaction flow.
 * Transactions before the active one are treated as success (completed).
 */
export const getTransactionStatusInFlow = (
  transactions: readonly Transaction[],
  transaction: Transaction,
  txState: ActiveTransactionState | undefined,
): TransactionMachineState | undefined => {
  const activeIndex = txState
    ? transactions.findIndex((t) => t.id === txState.txId)
    : -1

  const transactionIndex = transactions.findIndex(
    (t) => t.id === transaction.id,
  )
  if (transactionIndex === -1) return undefined

  if (activeIndex === -1) return undefined

  if (transactionIndex < activeIndex) return 'success'

  if (transactionIndex === activeIndex) {
    return getTransactionStatus(txState, transaction)
  }

  return undefined
}

/**
 * Gets status for a transaction, using flow-aware logic when multiple transactions exist.
 */
export const getStatus = (
  transactions: readonly Transaction[],
  transaction: Transaction,
  txState: ActiveTransactionState | undefined,
): TransactionMachineState | undefined => {
  return transactions.length > 1
    ? getTransactionStatusInFlow(transactions, transaction, txState)
    : getTransactionStatus(txState, transaction)
}
