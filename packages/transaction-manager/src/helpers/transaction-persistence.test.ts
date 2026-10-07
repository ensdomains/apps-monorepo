import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistedTransaction } from './transaction-persistence'

// `init()` logs a warning each time it falls through to localStorage, which is
// the normal path in every case here.
vi.mock('@ens-apps/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const ACTIVE_KEY_PREFIX = 'tx-'
const HISTORY_KEY = 'tx-history'

/**
 * The collision only exists on the localStorage backend: IndexedDB keeps active
 * records and history in separate object stores, so neither the `tx-` prefix
 * scan nor the memory maps can ever match the archive. Node has neither
 * `localStorage` nor `indexedDB`, so stubbing only localStorage leaves
 * `init()` falling through to it.
 */
function installLocalStorageStub(): void {
  const entries: Record<string, string> = {}

  const stub = new Proxy(entries, {
    get: (target, prop: string) => {
      if (prop === 'getItem') return (key: string) => target[key] ?? null
      if (prop === 'setItem')
        return (key: string, value: string) => {
          target[key] = String(value)
        }
      if (prop === 'removeItem')
        return (key: string) => {
          delete target[key]
        }
      if (prop === 'clear')
        return () => {
          for (const key of Object.keys(target)) delete target[key]
        }
      if (prop === 'key')
        return (index: number) => Object.keys(target)[index] ?? null
      if (prop === 'length') return Object.keys(target).length
      return Reflect.get(target, prop)
    },
    // Real `Storage` exposes each stored entry as an own enumerable property,
    // which is what the `Object.keys(localStorage)` key scans read.
    ownKeys: (target) => Object.keys(target),
    getOwnPropertyDescriptor: (target, prop) =>
      prop in target
        ? { value: target[prop], enumerable: true, configurable: true }
        : undefined,
  })

  vi.stubGlobal('localStorage', stub)
}

const transaction = (id: string): PersistedTransaction => ({
  id,
  state: 'success',
  context: null,
  timestamp: 1700000000000,
  updatedAt: 1700000000000,
})

const seedHistory = (ids: string[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(ids.map(transaction)))
}

const seedActive = (ids: string[]) => {
  for (const id of ids) {
    localStorage.setItem(
      `${ACTIVE_KEY_PREFIX}${id}`,
      JSON.stringify(transaction(id)),
    )
  }
}

// Surviving active-record keys, i.e. the archive deliberately left out.
const remainingActiveKeys = () =>
  Object.keys(localStorage).filter(
    (key) => key.startsWith(ACTIVE_KEY_PREFIX) && key !== HISTORY_KEY,
  )

// `storage` is a module-level singleton that caches the detected backend, so
// each case needs a freshly imported module to re-run detection.
const loadModule = () => import('./transaction-persistence')

describe('transaction persistence on the localStorage backend', () => {
  beforeEach(() => {
    vi.resetModules()
    installLocalStorageStub()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('selects localStorage when IndexedDB is unavailable', async () => {
    const { getStorageType } = await loadModule()

    expect(await getStorageType()).toBe('localstorage')
  })

  // Reached from `transactionManager.clearAllAndPersistence()`, which
  // `apps/manager` calls on wallet account switch - so clearing active
  // transactions must leave the archive alone.
  it('clearActive() deletes active records but preserves history', async () => {
    const { clearAllTransactions, getTransactionHistory } = await loadModule()
    seedHistory(['archived-1', 'archived-2'])
    seedActive(['active-1', 'active-2'])

    await clearAllTransactions()

    expect(remainingActiveKeys()).toEqual([])
    expect(localStorage.getItem(HISTORY_KEY)).not.toBeNull()
    expect((await getTransactionHistory()).map((t) => t.id)).toEqual([
      'archived-1',
      'archived-2',
    ])
  })

  // `'tx-history'.startsWith('tx-')` is true, so the old prefix scan parsed the
  // archive into a single bogus active record.
  it('getAll() ignores the history key', async () => {
    const { getAllTransactions } = await loadModule()
    seedHistory(['archived-1', 'archived-2'])
    seedActive(['active-1', 'active-2'])

    const all = await getAllTransactions()

    expect(all.map((t) => t.id).sort()).toEqual(['active-1', 'active-2'])
    expect(all.some((t) => Array.isArray(t))).toBe(false)
  })

  it('getActiveCount() is not inflated by the history key', async () => {
    const { getActiveCount } = await loadModule()
    seedHistory(['archived-1', 'archived-2'])
    seedActive(['active-1', 'active-2'])

    expect(await getActiveCount()).toBe(2)
  })

  it('exportAllData() separates active records from history', async () => {
    const { exportAllData } = await loadModule()
    seedHistory(['archived-1', 'archived-2'])
    seedActive(['active-1'])

    const { active, history } = await exportAllData()

    expect(active.map((t) => t.id)).toEqual(['active-1'])
    expect(history.map((t) => t.id)).toEqual(['archived-1', 'archived-2'])
  })

  it('clearTransactionHistory() still clears the archive only', async () => {
    const { clearTransactionHistory, getTransactionHistory } =
      await loadModule()
    seedHistory(['archived-1'])
    seedActive(['active-1'])

    await clearTransactionHistory()

    expect(await getTransactionHistory()).toEqual([])
    expect(remainingActiveKeys()).toEqual([`${ACTIVE_KEY_PREFIX}active-1`])
  })

  it('archives into history and drops the active record', async () => {
    const {
      archiveTransaction,
      clearAllTransactions,
      getAllTransactions,
      getTransactionHistory,
    } = await loadModule()
    seedActive(['active-1'])

    await archiveTransaction(transaction('active-1'))

    expect(await getAllTransactions()).toEqual([])
    expect((await getTransactionHistory()).map((t) => t.id)).toEqual([
      'active-1',
    ])

    // The clear that an account switch performs must keep the entry the archive
    // call just wrote.
    await clearAllTransactions()
    expect((await getTransactionHistory()).map((t) => t.id)).toEqual([
      'active-1',
    ])
  })

  it('accumulates archives across repeated archives', async () => {
    const { archiveTransaction, getTransactionHistory } = await loadModule()

    await archiveTransaction(transaction('active-1'))
    await archiveTransaction(transaction('active-2'))

    expect((await getTransactionHistory()).map((t) => t.id)).toEqual([
      'active-1',
      'active-2',
    ])
  })
})
