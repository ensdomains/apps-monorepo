import {
  type TransactionMachineState,
  useActiveTransactions,
} from '@ens-apps/transaction-manager'
import { useEffect, useState } from 'react'

export type ActiveTransactionState = {
  txId: string
  machineState: TransactionMachineState
  hash: string | undefined
  error: Error | undefined
}

/**
 * Subscribes to the transaction manager and returns the state of the most recent
 * active transaction. Returns null when there are no active transactions.
 */
export function useActiveTransactionState():
  | ActiveTransactionState
  | undefined {
  const transactions = useActiveTransactions()
  const [state, setState] = useState<ActiveTransactionState | undefined>(
    undefined,
  )

  useEffect(() => {
    const entries = Array.from(transactions.entries())
    const lastEntry = entries[entries.length - 1]
    const [txId, actor] = lastEntry ?? []

    if (!actor || !txId) {
      setState(undefined)
      return
    }

    const subscription = actor.subscribe((snapshot) => {
      const machineState = snapshot.value

      setState({
        txId,
        machineState,
        hash: snapshot.context.hash,
        error: snapshot.context.error,
      })
    })

    return () => subscription.unsubscribe()
  }, [transactions])

  return state
}
