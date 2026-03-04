import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { ActiveTransactionState } from '../hooks/useActiveTransactionState'
import type { Transaction } from '../types'

export const getTransactionStatus = (
  txState: ActiveTransactionState | undefined,
  transaction: Transaction | undefined,
): TransactionMachineState | undefined => {
  if (txState && transaction && txState.txId === transaction.id) {
    return txState.machineState
  }
}
