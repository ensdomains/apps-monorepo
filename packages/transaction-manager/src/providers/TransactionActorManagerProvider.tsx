import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type ActorRefFrom } from 'xstate'
import { transactionMachine } from '../machines/transaction.machine'
import { getPendingTransactions, type PersistedTransaction } from '../helpers/transaction-persistence'
import { transactionManager } from '../services/transactionManager'
import type { PublicClient } from 'viem'

interface TransactionActorManagerContextValue {
  transactions: Map<string, ActorRefFrom<typeof transactionMachine>>
}

interface TransactionActorManagerProviderProps {
  children: ReactNode
  publicClient: PublicClient
}

const TransactionActorManagerContext = createContext<TransactionActorManagerContextValue | null>(null)

/**
 * Transaction Actor Manager Provider
 *
 * React wrapper for the singleton TransactionManager.
 * Provides:
 * - React state subscriptions for UI components
 * - Auto-recovery of pending transactions
 *
 * Note: startTransaction() should be called directly from the singleton,
 * passing publicClient in options.
 *
 * SSR-safe: No global state stored in the provider.
 */
export function TransactionActorManagerProvider({
  children,
  publicClient
}: TransactionActorManagerProviderProps) {
  const [transactions, setTransactions] = useState<Map<string, ActorRefFrom<typeof transactionMachine>>>(
    new Map()
  )

  // Subscribe to singleton's transaction changes for React updates
  useEffect(() => {
    const unsubscribe = transactionManager.onTransactionsChange((txMap) => {
      setTransactions(txMap)
    })

    return unsubscribe
  }, [])

  // Auto-recover pending transactions on mount
  useEffect(() => {
    getPendingTransactions()
      .then((pending) => {
        if (pending.length === 0) {
          console.log('🔵 [PROVIDER] No pending transactions to recover')
          return
        }

        console.log(`🔄 [PROVIDER] Found ${pending.length} pending transactions to recover`)

        // For now, just log them - we'll implement auto-recovery when we have clients
        pending.forEach((persisted) => {
          console.log('📦 [PROVIDER] Pending transaction:', {
            id: persisted.id,
            state: persisted.state,
            hash: persisted.hash,
          })
        })
      })
      .catch((error) => {
        console.error('❌ [PROVIDER] Failed to recover pending transactions:', error)
      })
  }, [])

  const contextValue: TransactionActorManagerContextValue = {
    transactions,
  }

  return (
    <TransactionActorManagerContext.Provider value={contextValue}>
      {children}
    </TransactionActorManagerContext.Provider>
  )
}

/**
 * Hook to access the transaction actor manager (for UI components only)
 *
 * Returns the transactions Map for React components to subscribe to updates.
 *
 * NOTE: To start transactions, import and use the singleton directly:
 * ```
 * import { transactionManager } from '@ens-apps/transaction-manager'
 * transactionManager.startTransaction(request, signer, options)
 * ```
 */
export function useTransactionActorManager(): TransactionActorManagerContextValue {
  const context = useContext(TransactionActorManagerContext)
  if (!context) {
    throw new Error('useTransactionActorManager must be used within TransactionActorManagerProvider')
  }
  return context
}

/**
 * @deprecated Use useTransactionActorManager instead
 */
export function useTransactionManager(): TransactionActorManagerContextValue {
  return useTransactionActorManager()
}

/**
 * @deprecated Use useTransactionActorManager instead
 */
export function useTransactionRegistry(): TransactionActorManagerContextValue {
  return useTransactionActorManager()
}

/**
 * Hook to get a specific transaction actor by ID
 */
export function useTransaction(id: string): ActorRefFrom<typeof transactionMachine> | undefined {
  return transactionManager.getTransaction(id)
}

/**
 * Hook to get all active transactions
 */
export function useActiveTransactions(): Map<string, ActorRefFrom<typeof transactionMachine>> {
  const { transactions } = useTransactionActorManager()
  return transactions
}

/**
 * Hook to get recovered transactions (pending transactions from IndexedDB)
 */
export function useRecoveredTransactions(): PersistedTransaction[] {
  const [recovered, setRecovered] = useState<PersistedTransaction[]>([])

  useEffect(() => {
    getPendingTransactions()
      .then((pending) => {
        setRecovered(pending)
      })
      .catch((error) => {
        console.error('❌ [HOOK] Failed to get recovered transactions:', error)
      })
  }, [])

  return recovered
}
