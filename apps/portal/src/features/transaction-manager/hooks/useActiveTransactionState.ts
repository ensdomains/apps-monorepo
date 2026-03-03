import { useActiveTransactions } from '@ens-apps/transaction-manager'
import { useEffect, useState } from 'react'

function getRootState(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length > 0 && keys[0]) return keys[0]
  }
  return String(value)
}

export type ActiveTransactionState = {
  txId: string
  machineState: string
  hash: string | undefined
  error: Error | undefined
}

/**
 * Subscribes to the transaction manager and returns the state of the most recent
 * active transaction. Returns null when there are no active transactions.
 */
export function useActiveTransactionState(): ActiveTransactionState | null {
  const transactions = useActiveTransactions()
  const [state, setState] = useState<ActiveTransactionState | null>(null)

  useEffect(() => {
    const entries = Array.from(transactions.entries())
    const lastEntry = entries[entries.length - 1]
    const [txId, actor] = lastEntry ?? []

    if (!actor || !txId) {
      setState(null)
      return
    }

    const subscription = actor.subscribe((snapshot) => {
      const machineState = getRootState(snapshot.value)
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
