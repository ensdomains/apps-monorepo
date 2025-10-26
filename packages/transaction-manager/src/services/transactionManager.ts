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
 * - PublicClients are stored per-chain (safe to share - no user data)
 * - Supports fallback to per-transaction publicClient if not pre-configured
 * - Safe to use in Next.js, Remix, etc.
 * - No data leaks between server requests
 *
 * Benefits:
 * - No prop drilling - import and call directly
 * - Works outside React (Node.js, CLI, tests)
 * - Single source of truth for all transactions
 * - Supports multiple chains simultaneously
 * - Optional publicClient pre-configuration (less verbose)
 * - Still supports React integration via change listeners
 */
class TransactionManager {
  private transactions = new Map<string, ActorRefFrom<typeof transactionMachine>>()
  private listeners = new Set<TransactionChangeListener>()
  private publicClients = new Map<number, PublicClient>()  // chainId -> PublicClient

  /**
   * Set a public client for a specific chain
   *
   * This is optional - if set, you don't need to pass publicClient in startTransaction options.
   * Useful for reducing verbosity in single-chain or multi-chain apps.
   *
   * @param chainId - The chain ID (e.g., 1 for mainnet, 11155111 for sepolia)
   * @param publicClient - The public client for this chain
   */
  setPublicClient(chainId: number, publicClient: PublicClient): void {
    this.publicClients.set(chainId, publicClient)
    console.log(`✅ [TRANSACTION MANAGER] Public client set for chain ${chainId}`)
  }

  /**
   * Get a stored public client for a chain
   *
   * @param chainId - The chain ID
   * @returns The public client if set, undefined otherwise
   */
  getPublicClient(chainId: number): PublicClient | undefined {
    return this.publicClients.get(chainId)
  }

  /**
   * Start a new transaction
   *
   * publicClient can be:
   * 1. Passed in options (takes priority)
   * 2. Pre-configured via setPublicClient() - determined by request.chainId or options.chainId
   * 3. If neither, throws an error
   *
   * @param request - Unsigned transaction request
   * @param signer - Signer capability (EOA, Rhinestone, etc.)
   * @param options - Transaction options (modal, description, optional publicClient, optional chainId)
   * @returns Transaction ID
   */
  startTransaction(
    request: TransactionRequest,
    signer: Signer,
    options: TransactionOptions & { publicClient?: PublicClient; chainId?: number }
  ): string {
    const { publicClient: optionsPublicClient, chainId, ...transactionOptions } = options

    // Determine which publicClient to use (priority: options > stored > error)
    let publicClient = optionsPublicClient

    if (!publicClient) {
      // Try to get from stored clients using chainId
      const resolvedChainId = chainId || (request as any).chainId
      if (resolvedChainId) {
        publicClient = this.publicClients.get(resolvedChainId)
      }
    }

    if (!publicClient) {
      throw new Error(
        'publicClient is required. Either pass it in options or pre-configure it with setPublicClient(chainId, client)'
      )
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
