import type { Hash } from 'viem'

export interface PersistedTransaction {
  id: string
  hash?: Hash
  state: string
  context: any
  timestamp: number
  updatedAt: number
}

const STORAGE_PREFIX = 'tx-'
const STORAGE_KEY_ACTIVE = 'transactions-active'
const STORAGE_KEY_ARCHIVED = 'transactions-archived'

/**
 * Transaction Registry Service
 *
 * Simple localStorage/IndexedDB functions for persisting transaction state.
 * No runtime state, no React Context, just pure CRUD operations.
 */

/**
 * Custom JSON serializer that handles BigInt values
 */
function serializeTransaction(transaction: PersistedTransaction): string {
  return JSON.stringify(transaction, (key, value) => {
    // Convert BigInt to string with __bigint marker
    if (typeof value === 'bigint') {
      return { __bigint: value.toString() }
    }
    return value
  })
}

/**
 * Custom JSON deserializer that restores BigInt values
 */
function deserializeTransaction(json: string): PersistedTransaction {
  return JSON.parse(json, (key, value) => {
    // Restore BigInt from string
    if (value && typeof value === 'object' && '__bigint' in value) {
      return BigInt(value.__bigint)
    }
    return value
  })
}

/**
 * Save a transaction to localStorage
 */
export function saveTransaction(id: string, transaction: PersistedTransaction): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, serializeTransaction(transaction))
    console.log('💾 [REGISTRY] Saved transaction:', id)
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to save transaction:', error)
  }
}

/**
 * Get a transaction from localStorage
 */
export function getTransaction(id: string): PersistedTransaction | null {
  try {
    const data = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
    return data ? deserializeTransaction(data) : null
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to get transaction:', error)
    return null
  }
}

/**
 * Get all active transactions
 */
export function getAllTransactions(): PersistedTransaction[] {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX))
    return keys.map(k => {
      const data = localStorage.getItem(k)
      return data ? deserializeTransaction(data) : null
    }).filter(Boolean)
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to get all transactions:', error)
    return []
  }
}

/**
 * Get pending transactions (to recover on app load)
 */
export function getPendingTransactions(): PersistedTransaction[] {
  const all = getAllTransactions()
  return all.filter(tx =>
    tx.state === 'pending' ||
    tx.state === 'submitting' ||
    tx.state === 'preparing'
  )
}

/**
 * Remove a transaction from localStorage
 */
export function removeTransaction(id: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
    console.log('🗑️ [REGISTRY] Removed transaction:', id)
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to remove transaction:', error)
  }
}

/**
 * Clear all transactions
 */
export function clearAllTransactions(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX))
    keys.forEach(k => localStorage.removeItem(k))
    console.log('🧹 [REGISTRY] Cleared all transactions')
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to clear transactions:', error)
  }
}

/**
 * Archive a completed transaction
 */
export function archiveTransaction(transaction: PersistedTransaction): void {
  try {
    // Remove from active storage
    removeTransaction(transaction.id)

    // Add to archived list
    const archived = getArchivedTransactions()
    archived.push(transaction)

    // Keep only last 100 archived transactions
    const recent = archived.slice(-100)
    localStorage.setItem(STORAGE_KEY_ARCHIVED, JSON.stringify(recent, (key, value) => {
      if (typeof value === 'bigint') {
        return { __bigint: value.toString() }
      }
      return value
    }))

    console.log('📦 [REGISTRY] Archived transaction:', transaction.id)
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to archive transaction:', error)
  }
}

/**
 * Get archived transactions
 */
export function getArchivedTransactions(): PersistedTransaction[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_ARCHIVED)
    return data ? JSON.parse(data, (key, value) => {
      if (value && typeof value === 'object' && '__bigint' in value) {
        return BigInt(value.__bigint)
      }
      return value
    }) : []
  } catch (error) {
    console.error('❌ [REGISTRY] Failed to get archived transactions:', error)
    return []
  }
}
