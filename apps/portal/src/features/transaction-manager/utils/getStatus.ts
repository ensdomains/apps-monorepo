import type {
  TransactionMachineActor,
  TransactionMachineState,
} from '@ens-apps/transaction-manager'

function getStatusFromActor(
  actor: TransactionMachineActor,
): TransactionMachineState | undefined {
  const snapshot = actor.getSnapshot()

  // `context.error` survives into an auto-retry, which is not a failure.
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
