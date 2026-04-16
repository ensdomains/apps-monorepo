import type { PublicClient } from 'viem'
import { type ActorRefFrom, createActor } from 'xstate'
import {
  clearAllTransactions,
  type PersistedTransaction,
  removeTransaction,
  saveTransaction,
} from '../helpers/transaction-persistence'
import { transactionMachine } from '../machines/transaction.machine'
import {
  createRunTelemetryService,
  estimateTelemetryBytes,
} from '../services/run-telemetry.service'
import type {
  FailedRunPayloadV2,
  RunTelemetryEventSubscriber,
  RunTelemetrySubscriber,
  TransactionRunEventV2,
  TransactionRunStatus,
} from '../types/audit.types'
import type { Signer } from '../types/signer.types'
import type {
  TransactionIntent,
  TransactionOptions,
  TransactionRequest,
} from '../types/transaction.types'

type TransactionChangeListener = (
  transactions: Map<string, ActorRefFrom<typeof transactionMachine>>,
) => void

function getRootState(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length > 0 && keys[0]) return keys[0]
  }
  return String(value)
}

function isCancelledState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const root = (value as Record<string, unknown>).error
  return root === 'cancelled'
}

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
  private instanceId = `tm-${Math.random().toString(36).slice(2, 9)}`
  private transactions = new Map<
    string,
    ActorRefFrom<typeof transactionMachine>
  >()
  private listeners = new Set<TransactionChangeListener>()
  private telemetryListeners = new Set<RunTelemetrySubscriber>()
  private telemetryEventListeners = new Set<RunTelemetryEventSubscriber>()
  private publicClients = new Map<number, PublicClient>() // chainId -> PublicClient
  private completedTelemetry = new Set<string>()
  private runTelemetry = createRunTelemetryService()

  constructor() {
    console.log(`🔧 [TRANSACTION MANAGER] Instance created: ${this.instanceId}`)
  }

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
    console.log(
      `✅ [TRANSACTION MANAGER ${this.instanceId}] Public client set for chain ${chainId}`,
    )
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
   * 2. Pre-configured via setPublicClient() - determined by intent/request chainId or options.chainId
   * 3. If neither, throws an error
   *
   * @param intentOrRequest - Transaction intent (high-level) or unsigned transaction request (pre-prepared)
   * @param signer - Signer capability (EOA, Rhinestone, etc.)
   * @param options - Transaction options (modal, description, optional publicClient, optional chainId, optional useSmartAccount)
   * @returns Transaction ID
   */
  startTransaction(
    intentOrRequest: TransactionIntent | TransactionRequest,
    signer: Signer,
    options: TransactionOptions & {
      publicClient?: PublicClient
      chainId?: number
      useSmartAccount?: boolean
    },
  ): string {
    const {
      publicClient: optionsPublicClient,
      chainId,
      useSmartAccount,
      ...transactionOptions
    } = options

    // Determine if this is an intent or a pre-prepared request
    const isIntent =
      'type' in intentOrRequest &&
      (intentOrRequest.type === 'ens-renewal' ||
        intentOrRequest.type === 'eth-transfer' ||
        intentOrRequest.type === 'custom')

    const intent = isIntent ? (intentOrRequest as TransactionIntent) : undefined
    const request = isIntent
      ? undefined
      : (intentOrRequest as TransactionRequest)

    // Determine which publicClient to use (priority: options > stored > error)
    let publicClient = optionsPublicClient

    if (!publicClient) {
      // Try to get from stored clients using chainId
      const resolvedChainId =
        chainId ||
        request?.chainId ||
        // biome-ignore lint/suspicious/noExplicitAny: runtime duck-typing to extract chainId from intent variants
        (intent as any)?.chainId
      console.log(
        `🔍 [TRANSACTION MANAGER ${this.instanceId}] Resolving publicClient for chainId: ${resolvedChainId}`,
      )
      console.log(
        `🔍 [TRANSACTION MANAGER ${this.instanceId}] Stored publicClients:`,
        Array.from(this.publicClients.keys()),
      )
      if (resolvedChainId) {
        publicClient = this.publicClients.get(resolvedChainId)
        console.log(
          `🔍 [TRANSACTION MANAGER ${this.instanceId}] Found publicClient:`,
          !!publicClient,
        )
      }
    }

    if (!publicClient) {
      console.error(
        `❌ [TRANSACTION MANAGER ${this.instanceId}] No publicClient available`,
      )
      throw new Error(
        'publicClient is required. Either pass it in options or pre-configure it with setPublicClient(chainId, client)',
      )
    }

    const txId =
      transactionOptions.id ||
      `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    console.log('🚀 [TRANSACTION MANAGER] Starting transaction:', {
      id: txId,
      isIntent,
      intentType: intent?.type,
      requestType: request?.type,
      signerType: signer.type,
      chainId,
      useSmartAccount,
    })

    // Create and start the transaction actor
    const actor = createActor(transactionMachine, {
      input: {
        intent,
        request,
        signer,
        publicClient,
        options: transactionOptions,
        chainId,
        useSmartAccount,
      },
    })

    this.runTelemetry.startRun({
      txId,
      chainId,
      intent,
      request:
        request || (intent?.type === 'custom' ? intent.request : undefined),
      signer,
      options: transactionOptions,
      useSmartAccount: Boolean(useSmartAccount),
    })

    actor.start()

    console.log('✅ [TRANSACTION MANAGER] Actor started:', txId)

    // Subscribe to actor state changes for persistence
    actor.subscribe((snapshot) => {
      const state = getRootState(snapshot.value)
      const ctx = snapshot.context

      const telemetryEvent = this.runTelemetry.recordSnapshot(txId, snapshot)
      if (telemetryEvent) {
        this.notifyTelemetryEventListeners(
          telemetryEvent.runId,
          txId,
          telemetryEvent.event,
        )
      }

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

      // Remove from IndexedDB when complete
      if (state === 'success' || state === 'error') {
        console.log(
          `✅ [TRANSACTION MANAGER] Removing completed transaction ${txId}`,
        )
        removeTransaction(txId).catch((err) =>
          console.error(
            `❌ [TRANSACTION MANAGER] Failed to remove transaction ${txId}:`,
            err,
          ),
        )
      } else {
        saveTransaction(txId, persisted).catch((err) =>
          console.error(
            `❌ [TRANSACTION MANAGER] Failed to save transaction ${txId}:`,
            err,
          ),
        )
      }

      if (
        (state === 'success' || state === 'error') &&
        !this.completedTelemetry.has(txId)
      ) {
        this.completedTelemetry.add(txId)
        const terminalStatus: TransactionRunStatus =
          state === 'success'
            ? 'success'
            : isCancelledState(snapshot.value)
              ? 'cancelled'
              : 'error'
        const payload = this.runTelemetry.completeRun(txId, terminalStatus)
        if (payload) {
          this.notifyTelemetryListeners(payload)
        }
      }

      this.notifyListeners()
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

    // Remove from IndexedDB
    removeTransaction(id).catch((err) =>
      console.error(
        `❌ [TRANSACTION MANAGER] Failed to remove cancelled transaction ${id}:`,
        err,
      ),
    )
  }

  /**
   * Get a specific transaction actor by ID
   */
  getTransaction(
    id: string,
  ): ActorRefFrom<typeof transactionMachine> | undefined {
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

  onFailedRunTelemetry(listener: RunTelemetrySubscriber): () => void {
    this.telemetryListeners.add(listener)
    return () => {
      this.telemetryListeners.delete(listener)
    }
  }

  onRunTelemetryEvent(listener: RunTelemetryEventSubscriber): () => void {
    this.telemetryEventListeners.add(listener)
    return () => {
      this.telemetryEventListeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of transaction changes
   */
  private notifyListeners(): void {
    const txCopy = this.getTransactions()
    this.listeners.forEach((listener) => {
      listener(txCopy)
    })
  }

  private notifyTelemetryListeners(payload: FailedRunPayloadV2): void {
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(payload)
      } catch (error) {
        console.error(
          `❌ [TRANSACTION MANAGER ${this.instanceId}] Failed run telemetry listener crashed:`,
          error,
        )
      }
    })
  }

  private notifyTelemetryEventListeners(
    runId: string,
    txId: string,
    event: TransactionRunEventV2,
  ): void {
    this.telemetryEventListeners.forEach((listener) => {
      try {
        listener({
          runId,
          txId,
          status:
            event.phase === 'success'
              ? 'success'
              : event.phase === 'error' && event.substate === 'cancelled'
                ? 'cancelled'
                : event.phase === 'error'
                  ? 'error'
                  : undefined,
          event,
        })
      } catch (error) {
        console.error(
          `❌ [TRANSACTION MANAGER ${this.instanceId}] Telemetry event listener crashed:`,
          error,
        )
      }
    })
  }

  /**
   * Clear all transactions (for testing)
   */
  clear(): void {
    this.transactions.forEach((actor) => {
      actor.stop()
    })
    this.transactions.clear()
    this.completedTelemetry.clear()
    this.runTelemetry.clear()
    this.notifyListeners()
  }

  /**
   * Cancel and clear all active transactions
   */
  async clearAllAndPersistence(): Promise<void> {
    console.log(
      `🧹 [TRANSACTION MANAGER ${this.instanceId}] Clearing all transactions and persistence`,
    )

    this.transactions.forEach((actor, id) => {
      console.log(
        `🛑 [TRANSACTION MANAGER ${this.instanceId}] Stopping transaction ${id}`,
      )

      actor.send({ type: 'CANCEL' })
      actor.stop()
    })

    this.transactions.clear()
    this.completedTelemetry.clear()
    this.runTelemetry.clear()
    this.notifyListeners()

    try {
      await clearAllTransactions()
      console.log(
        `✅ [TRANSACTION MANAGER ${this.instanceId}] Cleared all persisted transactions`,
      )
    } catch (err) {
      console.error(
        `❌ [TRANSACTION MANAGER ${this.instanceId}] Failed to clear persisted transactions:`,
        err,
      )
    }
  }
}

// Export singleton instance
export const transactionManager = new TransactionManager()
export { estimateTelemetryBytes }
