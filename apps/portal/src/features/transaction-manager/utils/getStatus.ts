import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'
import { getTransactionStatus } from './getTransactionStatus'
import { getTransactionStatusInFlow } from './getTransactionStatusInFlow'

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
