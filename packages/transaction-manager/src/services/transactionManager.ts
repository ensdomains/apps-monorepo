import { createActor, type ActorRefFrom } from 'xstate'
import { transactionMachine } from '../machines/transaction.machine'
import {
  saveTransaction,
  removeTransaction,
  type PersistedTransaction,
} from './transaction-registry.service'
import type { TransactionRequest, TransactionOptions } from '../types/transaction.types'
import type { Signer } from '../types/signer.types'
import type { PublicClient } from 'viem'

type TransactionChangeListener = (transactions: Map<string, ActorRefFrom<typeof transactionMachine>>) => void

/**
 * Transaction Manager Singleton
 *
 * SSR-safe module-level singleton that manages transaction actors.
 * Can be called directly without React context.
 *
 * SSR Safety:
 * - No global publicClient state (passed per-transaction)
 * - Safe to use in Next.js, Remix, etc.
 * - No data leaks between server requests
 *
 * Benefits:
 * - No prop drilling - import and call directly
 * - Works outside React (Node.js, CLI, tests)
 * - Single source of truth for all transactions
 * - Supports multiple chains simultaneously
 * - Still supports React integration via change listeners
 */
class TransactionManager {
  private transactions = new Map<string, ActorRefFrom<typeof transactionMachine>>()
  private listeners = new Set<TransactionChangeListener>()

  /**
   * Start a new transaction
   *
   * SSR-safe: publicClient is passed per-transaction, not stored globally.
   *
   * @param request - Unsigned transaction request
   * @param signer - Signer capability (EOA, Rhinestone, etc.)
   * @param options - Transaction options (modal, description, publicClient, etc.)
   * @returns Transaction ID
   */
  startTransaction(
    request: TransactionRequest,
    signer: Signer,
    options: TransactionOptions & { publicClient: PublicClient }
  ): string {
    const { publicClient, ...transactionOptions } = options

    if (!publicClient) {
      throw new Error('publicClient is required in options')
    }

    const txId = transactionOptions.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    console.log('🚀 [TRANSACTION MANAGER] Starting transaction:', {
      id: txId,
      type: request.type,
      signerType: signer.type,
    })

    // Create and start the transaction actor
    const actor = createActor(transactionMachine, {
      input: {
        request,
        signer,
        publicClient,  // From options, not global state
        options: transactionOptions,
      },
    })

    actor.start()

    console.log('✅ [TRANSACTION MANAGER] Actor started:', txId)

    // Subscribe to actor state changes for persistence
    actor.subscribe((snapshot) => {
      const state = snapshot.value as string
      const ctx = snapshot.context

      console.log(`📊 [TRANSACTION MANAGER] Transaction ${txId} state:`, state)

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
        console.log(`✅ [TRANSACTION MANAGER] Removing completed transaction ${txId}`)
        removeTransaction(txId)
      } else {
        saveTransaction(txId, persisted)
      }
    })

    // Add to active transactions
    this.transactions.set(txId, actor)
    this.notifyListeners()

    return txId
  }

  /**
   * Cancel a transaction
   */
  cancelTransaction(id: string): void {
    console.log(`🛑 [TRANSACTION MANAGER] Cancelling transaction ${id}`)

    const actor = this.transactions.get(id)
    if (actor) {
      actor.send({ type: 'CANCEL' })
    }

    // Remove from active transactions
    this.transactions.delete(id)
    this.notifyListeners()

    // Remove from localStorage
    removeTransaction(id)
  }

  /**
   * Get a specific transaction actor by ID
   */
  getTransaction(id: string): ActorRefFrom<typeof transactionMachine> | undefined {
    return this.transactions.get(id)
  }

  /**
   * Get all active transactions
   */
  getTransactions(): Map<string, ActorRefFrom<typeof transactionMachine>> {
    return new Map(this.transactions)
  }

  /**
   * Subscribe to transaction changes (for React integration)
   *
   * @param listener - Callback fired when transactions change
   * @returns Unsubscribe function
   */
  onTransactionsChange(listener: TransactionChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of transaction changes
   */
  private notifyListeners(): void {
    const txCopy = this.getTransactions()
    this.listeners.forEach((listener) => listener(txCopy))
  }

  /**
   * Clear all transactions (for testing)
   */
  clear(): void {
    this.transactions.forEach((actor) => actor.stop())
    this.transactions.clear()
    this.notifyListeners()
  }
}

// Export singleton instance
export const transactionManager = new TransactionManager()
