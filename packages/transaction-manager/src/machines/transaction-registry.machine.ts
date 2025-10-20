import { setup, assign, fromPromise, sendTo, type ActorRefFrom } from 'xstate'
import { transactionMachine } from './transaction.machine'
import {
  saveActiveTransaction,
  getActiveTransactions,
  removeActiveTransaction,
  archiveTransaction,
  type PersistedTransaction,
} from '../helpers/transaction-persistence'
import type { TransactionRequest } from '../types/transaction.types'

export interface TransactionRegistryContext {
  transactions: Map<string, ActorRefFrom<typeof transactionMachine>>
  recoveredTransactions: PersistedTransaction[]
  error?: Error
}

export type TransactionRegistryEvent =
  | { type: 'START_TRANSACTION'; request: TransactionRequest; id: string }
  | { type: 'CANCEL_TRANSACTION'; id: string }
  | { type: 'RECOVER_TRANSACTIONS' }
  | { type: 'CLEAR_RECOVERED' }
  | { type: 'TRANSACTION_UPDATED'; id: string; snapshot: any }
  | { type: 'TRANSACTION_COMPLETED'; id: string }
  | { type: 'TRANSACTION_FAILED'; id: string; error: Error }

/**
 * Transaction Registry Machine
 *
 * Manages multiple transaction actors and persists their state to IndexedDB.
 * Automatically recovers pending transactions on app startup.
 */
export const transactionRegistryMachine = setup({
  types: {
    context: {} as TransactionRegistryContext,
    events: {} as TransactionRegistryEvent,
  },
  actors: {
    /**
     * Recover active transactions from IndexedDB
     */
    recoverTransactions: fromPromise(async () => {
      console.log('🔄 [REGISTRY] Recovering transactions from IndexedDB...')
      const transactions = await getActiveTransactions()
      console.log(`✅ [REGISTRY] Found ${transactions.length} transactions to recover`)
      return transactions
    }),

    /**
     * Transaction machine actor spawned for each transaction
     */
    transaction: transactionMachine,
  },
}).createMachine({
  id: 'transactionRegistry',
  initial: 'recovering',
  context: {
    transactions: new Map(),
    recoveredTransactions: [],
  },
  states: {
    /**
     * Recovery State
     * Loads pending transactions from IndexedDB on startup
     */
    recovering: {
      invoke: {
        src: 'recoverTransactions',
        onDone: {
          target: 'idle',
          actions: assign({
            recoveredTransactions: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'idle',
          actions: assign({
            error: ({ event }) => event.error as Error,
          }),
        },
      },
    },

    /**
     * Idle State
     * Ready to start or recover transactions
     */
    idle: {
      on: {
        START_TRANSACTION: {
          actions: [
            assign({
              transactions: ({ context, event, spawn }) => {
                const newMap = new Map(context.transactions)

                console.log('🚀 [REGISTRY] Starting new transaction:', {
                  id: event.id,
                  type: event.request.type,
                })

                // Spawn new transaction actor
                const actor = spawn('transaction', {
                  id: event.id,
                  input: {
                    request: event.request,
                  },
                })

                // Subscribe to actor state changes for persistence
                actor.subscribe((snapshot) => {
                  const state = snapshot.value as string
                  const context = snapshot.context

                  console.log(`📊 [REGISTRY] Transaction ${event.id} state:`, state)

                  // Persist transaction state
                  const persisted: PersistedTransaction = {
                    id: event.id,
                    request: event.request,
                    hash: context.hash,
                    status: state as any,
                    error: context.error?.message,
                    timestamp: Date.now(),
                    updatedAt: Date.now(),
                  }

                  // Archive completed/failed transactions, save active ones
                  if (state === 'confirmed' || state === 'failed') {
                    console.log(`✅ [REGISTRY] Archiving ${state} transaction ${event.id}`)
                    archiveTransaction(persisted).catch((err) => {
                      console.error('❌ [REGISTRY] Failed to archive transaction:', err)
                    })
                  } else {
                    saveActiveTransaction(persisted).catch((err) => {
                      console.error('❌ [REGISTRY] Failed to save transaction:', err)
                    })
                  }
                })

                newMap.set(event.id, actor)
                return newMap
              },
            }),
          ],
        },

        CANCEL_TRANSACTION: {
          actions: [
            ({ context, event }) => {
              const actor = context.transactions.get(event.id)
              if (actor) {
                console.log(`🛑 [REGISTRY] Cancelling transaction ${event.id}`)
                actor.send({ type: 'CANCEL' })
              }
            },
            assign({
              transactions: ({ context, event }) => {
                const newMap = new Map(context.transactions)
                newMap.delete(event.id)
                return newMap
              },
            }),
            // Remove from IndexedDB
            ({ event }) => {
              removeActiveTransaction(event.id).catch((err) => {
                console.error('❌ [REGISTRY] Failed to remove transaction from storage:', err)
              })
            },
          ],
        },

        RECOVER_TRANSACTIONS: {
          actions: [
            assign({
              transactions: ({ context, spawn }) => {
                const newMap = new Map(context.transactions)

                console.log(`🔄 [REGISTRY] Recovering ${context.recoveredTransactions.length} transactions`)

                context.recoveredTransactions.forEach((persisted) => {
                  // Only recover transactions that are still pending
                  if (
                    persisted.status === 'pending' ||
                    persisted.status === 'submitting' ||
                    persisted.status === 'preparing'
                  ) {
                    console.log('♻️ [REGISTRY] Recovering transaction:', {
                      id: persisted.id,
                      status: persisted.status,
                      hash: persisted.hash,
                    })

                    // Spawn actor in resumed state
                    const actor = spawn('transaction', {
                      id: persisted.id,
                      input: {
                        request: persisted.request,
                        hash: persisted.hash,
                        resumeFromPending: persisted.status === 'pending' && !!persisted.hash,
                      },
                    })

                    // Subscribe to state changes
                    actor.subscribe((snapshot) => {
                      const state = snapshot.value as string
                      const context = snapshot.context

                      const updated: PersistedTransaction = {
                        ...persisted,
                        hash: context.hash,
                        status: state as any,
                        error: context.error?.message,
                        updatedAt: Date.now(),
                      }

                      if (state === 'confirmed' || state === 'failed') {
                        archiveTransaction(updated).catch((err) => {
                          console.error('❌ [REGISTRY] Failed to archive recovered transaction:', err)
                        })
                      } else {
                        saveActiveTransaction(updated).catch((err) => {
                          console.error('❌ [REGISTRY] Failed to save recovered transaction:', err)
                        })
                      }
                    })

                    newMap.set(persisted.id, actor)
                  } else {
                    // Archive transactions that are already complete/failed
                    console.log(`📦 [REGISTRY] Archiving completed transaction ${persisted.id}`)
                    archiveTransaction(persisted).catch((err) => {
                      console.error('❌ [REGISTRY] Failed to archive transaction:', err)
                    })
                  }
                })

                return newMap
              },
            }),
          ],
        },

        CLEAR_RECOVERED: {
          actions: assign({
            recoveredTransactions: [],
          }),
        },
      },
    },
  },
})

export type TransactionRegistryActor = ActorRefFrom<typeof transactionRegistryMachine>
