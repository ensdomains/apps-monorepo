import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createActor, type ActorRefFrom } from 'xstate'
import { transactionMachine } from '../machines/transaction.machine'
import {
  saveTransaction,
  getPendingTransactions,
  removeTransaction,
  type PersistedTransaction,
} from '../services/transaction-registry.service'
import type { TransactionRequest, TransactionOptions } from '../types/transaction.types'
import type { Signer } from '../types/signer.types'
import type { PublicClient } from 'viem'

interface TransactionActorManagerContextValue {
  transactions: Map<string, ActorRefFrom<typeof transactionMachine>>
  startTransaction: (
    request: TransactionRequest,
    signer: Signer,
    options?: TransactionOptions
  ) => string
  cancelTransaction: (id: string) => void
  getTransaction: (id: string) => ActorRefFrom<typeof transactionMachine> | undefined
}

interface TransactionActorManagerProviderProps {
  children: ReactNode
  publicClient: PublicClient
}

const TransactionActorManagerContext = createContext<TransactionActorManagerContextValue | null>(null)

/**
 * Transaction Actor Manager Provider
 *
 * Simple React Context (not a state machine) that:
 * - Spawns transaction actors for each transaction
 * - Persists transaction state to localStorage via registry service
 * - Recovers pending transactions on mount
 * - Accepts any Signer type (EOA, Rhinestone, Privy, etc.)
 * - No complex state management needed!
 */
export function TransactionActorManagerProvider({
  children,
  publicClient
}: TransactionActorManagerProviderProps) {
  const [transactions, setTransactions] = useState<Map<string, ActorRefFrom<typeof transactionMachine>>>(
    new Map()
  )

  // Auto-recover pending transactions on mount
  useEffect(() => {
    const pending = getPendingTransactions()

    if (pending.length === 0) {
      console.log('🔵 [ACTOR MANAGER] No pending transactions to recover')
      return
    }

    console.log(`🔄 [ACTOR MANAGER] Found ${pending.length} pending transactions to recover`)

    // For now, just log them - we'll implement auto-recovery when we have clients
    pending.forEach((persisted) => {
      console.log('📦 [ACTOR MANAGER] Pending transaction:', {
        id: persisted.id,
        state: persisted.state,
        hash: persisted.hash,
      })
    })
  }, [])

  const startTransaction = (
    request: TransactionRequest,
    signer: Signer,
    options?: TransactionOptions
  ): string => {
    const txId = options?.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    console.log('🚀 [ACTOR MANAGER] Starting transaction:', {
      id: txId,
      type: request.type,
      signerType: signer.type,
    })

    // Create and start the transaction actor
    const actor = createActor(transactionMachine, {
      input: {
        request,
        signer,
        publicClient,
        options,
      },
    })

    actor.start()

    console.log('✅ [ACTOR MANAGER] Actor started:', txId)

    // Subscribe to actor state changes for persistence
    actor.subscribe((snapshot) => {
      const state = snapshot.value as string
      const ctx = snapshot.context

      console.log(`📊 [ACTOR MANAGER] Transaction ${txId} state:`, state)

      // Persist transaction state
      const persisted: PersistedTransaction = {
        id: txId,
        hash: ctx.hash,
        state,
        context: {
          request,
          error: ctx.error?.message,
        },
        timestamp: Date.now(),
        updatedAt: Date.now(),
      }

      // Remove from localStorage when complete
      if (state === 'success' || state === 'error') {
        console.log(`✅ [ACTOR MANAGER] Removing completed transaction ${txId}`)
        removeTransaction(txId)
      } else {
        saveTransaction(txId, persisted)
      }
    })

    // Add to active transactions
    setTransactions((prev) => {
      const newMap = new Map(prev)
      newMap.set(txId, actor)
      return newMap
    })

    return txId
  }

  const cancelTransaction = (id: string) => {
    console.log(`🛑 [ACTOR MANAGER] Cancelling transaction ${id}`)

    const actor = transactions.get(id)
    if (actor) {
      actor.send({ type: 'CANCEL' })
    }

    // Remove from active transactions
    setTransactions((prev) => {
      const newMap = new Map(prev)
      newMap.delete(id)
      return newMap
    })

    // Remove from localStorage
    removeTransaction(id)
  }

  const getTransaction = (id: string) => {
    return transactions.get(id)
  }

  const contextValue: TransactionActorManagerContextValue = {
    transactions,
    startTransaction,
    cancelTransaction,
    getTransaction,
  }

  return (
    <TransactionActorManagerContext.Provider value={contextValue}>
      {children}
    </TransactionActorManagerContext.Provider>
  )
}

/**
 * Hook to access the transaction actor manager
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
  const { getTransaction } = useTransactionActorManager()
  return getTransaction(id)
}

/**
 * Hook to get all active transactions
 */
export function useActiveTransactions(): Map<string, ActorRefFrom<typeof transactionMachine>> {
  const { transactions } = useTransactionActorManager()
  return transactions
}

/**
 * Hook to get recovered transactions (pending transactions from localStorage)
 */
export function useRecoveredTransactions(): PersistedTransaction[] {
  const [recovered, setRecovered] = useState<PersistedTransaction[]>([])

  useEffect(() => {
    const pending = getPendingTransactions()
    setRecovered(pending)
  }, [])

  return recovered
}
