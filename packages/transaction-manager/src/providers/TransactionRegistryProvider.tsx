import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import { useSelector } from '@xstate/react'
import { createActor, type ActorRefFrom } from 'xstate'
import { transactionRegistryMachine } from '../machines/transaction-registry.machine'
import type { TransactionRequest } from '../types/transaction.types'

interface TransactionRegistryContextValue {
  actor: ActorRefFrom<typeof transactionRegistryMachine>
  state: any
  startTransaction: (request: TransactionRequest, id?: string) => string
  cancelTransaction: (id: string) => void
  recoverTransactions: () => void
  clearRecovered: () => void
  hasRecoveredTransactions: boolean
}

const TransactionRegistryContext = createContext<TransactionRegistryContextValue | null>(null)

/**
 * Transaction Registry Provider
 *
 * Provides a global transaction registry that:
 * - Manages multiple transaction actors
 * - Persists transaction state to IndexedDB
 * - Recovers pending transactions on app startup
 * - Emits events for UI notifications (toasts, status updates)
 */
export function TransactionRegistryProvider({ children }: { children: ReactNode }) {
  // Create the registry actor (pure initializer - no side effects)
  const [actor] = useState(() => {
    console.log('🏗️ [PROVIDER] Creating transaction registry actor')
    return createActor(transactionRegistryMachine)
  })

  // Use useSelector to read from the actor (XState v5 pattern)
  const state = useSelector(actor, (snapshot) => snapshot)

  // Start actor on mount, stop on unmount (side effects in useEffect)
  useEffect(() => {
    console.log('▶️ [PROVIDER] Starting transaction registry actor')
    actor.start()

    return () => {
      console.log('⏹️ [PROVIDER] Stopping transaction registry actor')
      actor.stop()
    }
  }, [actor])

  // Auto-recover transactions when registry enters idle state
  useEffect(() => {
    if (state.matches('idle') && state.context.recoveredTransactions.length > 0) {
      console.log('🔄 [PROVIDER] Auto-recovering transactions')
      actor.send({ type: 'RECOVER_TRANSACTIONS' })
    }
  }, [state, actor])

  const contextValue: TransactionRegistryContextValue = {
    actor,
    state,
    startTransaction: (request: TransactionRequest, id?: string) => {
      const txId = id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      console.log('🚀 [PROVIDER] Starting transaction:', txId)
      actor.send({ type: 'START_TRANSACTION', request, id: txId })
      return txId
    },
    cancelTransaction: (id: string) => {
      console.log('🛑 [PROVIDER] Cancelling transaction:', id)
      actor.send({ type: 'CANCEL_TRANSACTION', id })
    },
    recoverTransactions: () => {
      console.log('🔄 [PROVIDER] Manually recovering transactions')
      actor.send({ type: 'RECOVER_TRANSACTIONS' })
    },
    clearRecovered: () => {
      console.log('🧹 [PROVIDER] Clearing recovered transactions list')
      actor.send({ type: 'CLEAR_RECOVERED' })
    },
    hasRecoveredTransactions: state.context.recoveredTransactions.length > 0,
  }

  return (
    <TransactionRegistryContext.Provider value={contextValue}>
      {children}
    </TransactionRegistryContext.Provider>
  )
}

/**
 * Hook to access the transaction registry
 */
export function useTransactionRegistry(): TransactionRegistryContextValue {
  const context = useContext(TransactionRegistryContext)
  if (!context) {
    throw new Error('useTransactionRegistry must be used within TransactionRegistryProvider')
  }
  return context
}

/**
 * Hook to get a specific transaction actor by ID
 */
export function useTransaction(id: string): ActorRefFrom<any> | undefined {
  const { state } = useTransactionRegistry()
  return state.context.transactions.get(id)
}

/**
 * Hook to get all active transactions
 */
export function useActiveTransactions(): Map<string, ActorRefFrom<any>> {
  const { state } = useTransactionRegistry()
  return state.context.transactions
}

/**
 * Hook to get recovered transactions (before they're restarted)
 */
export function useRecoveredTransactions() {
  const { state } = useTransactionRegistry()
  return state.context.recoveredTransactions
}
