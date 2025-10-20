import { openDB, type IDBPDatabase } from 'idb'
import type { TransactionRequest } from '../types/transaction.types'

const DB_NAME = 'ens-transaction-manager'
const DB_VERSION = 1
const ACTIVE_STORE = 'active-transactions'
const HISTORY_STORE = 'transaction-history'
const MAX_HISTORY_SIZE = 1000

export interface PersistedTransaction {
  id: string
  request: TransactionRequest
  hash?: string
  status: 'idle' | 'preparing' | 'submitting' | 'pending' | 'confirmed' | 'failed'
  error?: string
  timestamp: number
  updatedAt: number
}

/**
 * Initialize IndexedDB database
 */
async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Store for active/pending transactions
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) {
        const activeStore = db.createObjectStore(ACTIVE_STORE, { keyPath: 'id' })
        activeStore.createIndex('status', 'status')
        activeStore.createIndex('timestamp', 'timestamp')
      }

      // Store for transaction history
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' })
        historyStore.createIndex('timestamp', 'timestamp')
        historyStore.createIndex('status', 'status')
      }
    },
  })
}

/**
 * Save an active transaction to IndexedDB
 */
export async function saveActiveTransaction(transaction: PersistedTransaction): Promise<void> {
  const db = await initDB()
  await db.put(ACTIVE_STORE, {
    ...transaction,
    updatedAt: Date.now(),
  })
}

/**
 * Get all active transactions from IndexedDB
 */
export async function getActiveTransactions(): Promise<PersistedTransaction[]> {
  const db = await initDB()
  return db.getAll(ACTIVE_STORE)
}

/**
 * Get a specific active transaction by ID
 */
export async function getActiveTransaction(id: string): Promise<PersistedTransaction | undefined> {
  const db = await initDB()
  return db.get(ACTIVE_STORE, id)
}

/**
 * Remove a transaction from active storage
 */
export async function removeActiveTransaction(id: string): Promise<void> {
  const db = await initDB()
  await db.delete(ACTIVE_STORE, id)
}

/**
 * Move a transaction from active to history
 */
export async function archiveTransaction(transaction: PersistedTransaction): Promise<void> {
  const db = await initDB()

  // Add to history
  await db.put(HISTORY_STORE, {
    ...transaction,
    updatedAt: Date.now(),
  })

  // Remove from active
  await db.delete(ACTIVE_STORE, transaction.id)

  // Prune history if needed
  await pruneHistory(db)
}

/**
 * Prune transaction history to maintain MAX_HISTORY_SIZE limit
 */
async function pruneHistory(db: IDBPDatabase): Promise<void> {
  const tx = db.transaction(HISTORY_STORE, 'readwrite')
  const store = tx.objectStore(HISTORY_STORE)
  const index = store.index('timestamp')

  // Get all entries sorted by timestamp (oldest first)
  const allEntries = await index.getAll()

  // If we're over the limit, delete oldest entries
  if (allEntries.length > MAX_HISTORY_SIZE) {
    const entriesToDelete = allEntries.length - MAX_HISTORY_SIZE
    const sortedByTimestamp = allEntries.sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 0; i < entriesToDelete; i++) {
      await store.delete(sortedByTimestamp[i].id)
    }
  }

  await tx.done
}

/**
 * Get transaction history (most recent first)
 */
export async function getTransactionHistory(limit?: number): Promise<PersistedTransaction[]> {
  const db = await initDB()
  const tx = db.transaction(HISTORY_STORE, 'readonly')
  const index = tx.objectStore(HISTORY_STORE).index('timestamp')

  const allEntries = await index.getAll()

  // Sort by timestamp descending (most recent first)
  const sorted = allEntries.sort((a, b) => b.timestamp - a.timestamp)

  return limit ? sorted.slice(0, limit) : sorted
}

/**
 * Clear all active transactions (useful for testing/debugging)
 */
export async function clearActiveTransactions(): Promise<void> {
  const db = await initDB()
  await db.clear(ACTIVE_STORE)
}

/**
 * Clear all transaction history (useful for testing/debugging)
 */
export async function clearTransactionHistory(): Promise<void> {
  const db = await initDB()
  await db.clear(HISTORY_STORE)
}

/**
 * Get count of transactions in history
 */
export async function getHistoryCount(): Promise<number> {
  const db = await initDB()
  return db.count(HISTORY_STORE)
}

/**
 * Get count of active transactions
 */
export async function getActiveCount(): Promise<number> {
  const db = await initDB()
  return db.count(ACTIVE_STORE)
}

/**
 * Export all data for backup/debugging
 */
export async function exportAllData(): Promise<{
  active: PersistedTransaction[]
  history: PersistedTransaction[]
}> {
  const db = await initDB()
  const [active, history] = await Promise.all([
    db.getAll(ACTIVE_STORE),
    db.getAll(HISTORY_STORE),
  ])

  return { active, history }
}
