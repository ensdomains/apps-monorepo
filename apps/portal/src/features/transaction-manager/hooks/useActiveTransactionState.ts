import {
  type TransactionMachineState,
  useActiveTransactions,
} from '@ens-apps/transaction-manager'

export type ActiveTransactionState = {
  txId: string
  machineState: TransactionMachineState
  hash: string | undefined
  error: Error | undefined
}

/**
 * Derives the state of the most recent active transaction from the transaction
 * manager. Single source of truth - no duplicated state. Uses useSyncExternalStore
 * to subscribe to actor updates and re-read on each render.
 */
export function useActiveTransactionState():
  | ActiveTransactionState
  | undefined {
  const transactions = useActiveTransactions()

  const entries = Array.from(transactions.entries())
  const lastEntry = entries[entries.length - 1]
  const [txId, actor] = lastEntry ?? []

  if (!actor || !txId) {
    return undefined
  }

  const snapshot = actor.getSnapshot()

  return {
    txId,
    machineState: snapshot.value as TransactionMachineState,
    hash: snapshot.context.hash,
    error: snapshot.context.error,
  }
}
