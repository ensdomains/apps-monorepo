import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getTransactionStatus } from './getTransactionStatus'

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
