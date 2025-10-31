import { openDB, type IDBPDatabase } from 'idb'
import type { Hash } from 'viem'

const DB_NAME = 'ens-transaction-manager'
const DB_VERSION = 1
const ACTIVE_STORE = 'active-transactions'
const HISTORY_STORE = 'transaction-history'
const MAX_HISTORY_SIZE = 1000

export interface PersistedTransaction {
  id: string
  hash?: Hash
  state: string
  context: any
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
        activeStore.createIndex('state', 'state')
        activeStore.createIndex('timestamp', 'timestamp')
      }

      // Store for transaction history
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' })
        historyStore.createIndex('timestamp', 'timestamp')
        historyStore.createIndex('state', 'state')
      }
    },
  })
}

/**
 * Save a transaction to IndexedDB
 * Replaces: transaction-registry.service.ts saveTransaction()
 */
export async function saveTransaction(id: string, transaction: PersistedTransaction): Promise<void> {
  try {
    const db = await initDB()
    await db.put(ACTIVE_STORE, {
      ...transaction,
      id,
      updatedAt: Date.now(),
    })
    console.log('💾 [PERSISTENCE] Saved transaction:', id)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to save transaction:', error)
    throw error
  }
}

/**
 * Get a transaction from IndexedDB
 * Replaces: transaction-registry.service.ts getTransaction()
 */
export async function getTransaction(id: string): Promise<PersistedTransaction | null> {
  try {
    const db = await initDB()
    const transaction = await db.get(ACTIVE_STORE, id)
    return transaction || null
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to get transaction:', error)
    return null
  }
}

/**
 * Get all active transactions
 * Replaces: transaction-registry.service.ts getAllTransactions()
 */
export async function getAllTransactions(): Promise<PersistedTransaction[]> {
  try {
    const db = await initDB()
    return await db.getAll(ACTIVE_STORE)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to get all transactions:', error)
    return []
  }
}

/**
 * Get pending transactions (to recover on app load)
 * Replaces: transaction-registry.service.ts getPendingTransactions()
 */
export async function getPendingTransactions(): Promise<PersistedTransaction[]> {
  try {
    const all = await getAllTransactions()
    return all.filter(tx =>
      tx.state === 'pending' ||
      tx.state === 'submitting' ||
      tx.state === 'preparing'
    )
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to get pending transactions:', error)
    return []
  }
}

/**
 * Remove a transaction from IndexedDB
 * Replaces: transaction-registry.service.ts removeTransaction()
 */
export async function removeTransaction(id: string): Promise<void> {
  try {
    const db = await initDB()
    await db.delete(ACTIVE_STORE, id)
    console.log('🗑️ [PERSISTENCE] Removed transaction:', id)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to remove transaction:', error)
    throw error
  }
}

/**
 * Clear all active transactions
 * Replaces: transaction-registry.service.ts clearAllTransactions()
 */
export async function clearAllTransactions(): Promise<void> {
  try {
    const db = await initDB()
    await db.clear(ACTIVE_STORE)
    console.log('🧹 [PERSISTENCE] Cleared all transactions')
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to clear transactions:', error)
    throw error
  }
}

/**
 * Archive a completed transaction
 * Replaces: transaction-registry.service.ts archiveTransaction()
 */
export async function archiveTransaction(transaction: PersistedTransaction): Promise<void> {
  try {
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

    console.log('📦 [PERSISTENCE] Archived transaction:', transaction.id)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to archive transaction:', error)
    throw error
  }
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
 * Get archived transactions
 * Replaces: transaction-registry.service.ts getArchivedTransactions()
 */
export async function getArchivedTransactions(): Promise<PersistedTransaction[]> {
  try {
    const db = await initDB()
    const tx = db.transaction(HISTORY_STORE, 'readonly')
    const index = tx.objectStore(HISTORY_STORE).index('timestamp')

    const allEntries = await index.getAll()

    // Sort by timestamp descending (most recent first)
    return allEntries.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to get archived transactions:', error)
    return []
  }
}

/**
 * Get transaction history (most recent first)
 */
export async function getTransactionHistory(limit?: number): Promise<PersistedTransaction[]> {
  const archived = await getArchivedTransactions()
  return limit ? archived.slice(0, limit) : archived
}

/**
 * Clear all transaction history
 */
export async function clearTransactionHistory(): Promise<void> {
  try {
    const db = await initDB()
    await db.clear(HISTORY_STORE)
    console.log('🧹 [PERSISTENCE] Cleared transaction history')
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to clear history:', error)
    throw error
  }
}

/**
 * Get count of transactions in history
 */
export async function getHistoryCount(): Promise<number> {
  try {
    const db = await initDB()
    return await db.count(HISTORY_STORE)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to get history count:', error)
    return 0
  }
}

/**
 * Get count of active transactions
 */
export async function getActiveCount(): Promise<number> {
  try {
    const db = await initDB()
    return await db.count(ACTIVE_STORE)
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to get active count:', error)
    return 0
  }
}

/**
 * Export all data for backup/debugging
 */
export async function exportAllData(): Promise<{
  active: PersistedTransaction[]
  history: PersistedTransaction[]
}> {
  try {
    const db = await initDB()
    const [active, history] = await Promise.all([
      db.getAll(ACTIVE_STORE),
      db.getAll(HISTORY_STORE),
    ])

    return { active, history }
  } catch (error) {
    console.error('❌ [PERSISTENCE] Failed to export data:', error)
    return { active: [], history: [] }
  }
}
