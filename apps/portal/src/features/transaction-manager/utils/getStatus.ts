import type {
  TransactionMachineActor,
  TransactionMachineState,
} from '@ens-apps/transaction-manager'

function getStatusFromActor(
  actor: TransactionMachineActor,
): TransactionMachineState | undefined {
  const snapshot = actor.getSnapshot()

  // Read the state, not `context.error`: an auto-retry keeps the last attempt's
  // error while it resubmits, and reporting that as failed offers a "Try again"
  // the flow cannot act on yet.
  if (snapshot.matches('error')) return 'error'

  return snapshot.value as TransactionMachineState
}

/**
 * Gets status for a transaction from the active transactions map.
 * Returns undefined (not started) when the transaction is not in the map.
 */
export const getStatus = (
  transactionId: string,
  activeTransactionsMap: Map<string, TransactionMachineActor>,
): TransactionMachineState | undefined => {
  const actor = activeTransactionsMap.get(transactionId)

  if (actor) {
    return getStatusFromActor(actor)
  }

  return undefined
}
