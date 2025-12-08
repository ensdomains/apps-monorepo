import {
  type DehydrateOptions,
  dehydrate,
  hydrate,
  type QueryClient,
} from '@tanstack/react-query'

type PersistedState = { version?: number; state?: unknown }

type IndexedDbConfig = {
  dbName: string
  storeName: string
  key: string
}

type CreateQueryCachePersistenceParams = {
  queryClient: QueryClient
  cacheVersion: number
  shouldDehydrateQuery: NonNullable<DehydrateOptions['shouldDehydrateQuery']>
  localStorageKey: string
  indexedDb: IndexedDbConfig
}

const openPersistDb = ({ dbName, storeName }: IndexedDbConfig) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB'))
    request.onsuccess = () => resolve(request.result)
  })

const readPersistedState = async (
  config: IndexedDbConfig,
): Promise<PersistedState | undefined> => {
  const db = await openPersistDb(config)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(config.storeName, 'readonly')
    const store = tx.objectStore(config.storeName)
    const request = store.get(config.key)
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to read cache'))
    request.onsuccess = () => resolve(request.result as PersistedState)
    tx.oncomplete = () => db.close()
  })
}

const writePersistedState = async (
  config: IndexedDbConfig,
  data: PersistedState,
) => {
  const db = await openPersistDb(config)
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(config.storeName, 'readwrite')
    const store = tx.objectStore(config.storeName)
    store.put(data, config.key)
    tx.onerror = () =>
      reject(tx.error ?? new Error('Failed to write cache to IndexedDB'))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
  })
}

const hydrateFromLocal = (
  queryClient: QueryClient,
  cacheVersion: number,
  key: string,
) => {
  const cached = window.localStorage.getItem(key)
  if (!cached) return
  const parsed = JSON.parse(cached) as PersistedState
  if (parsed?.version === cacheVersion && parsed.state) {
    hydrate(queryClient, parsed.state as any)
  }
}

const hydrateFromIndexedDb = async (
  queryClient: QueryClient,
  cacheVersion: number,
  config: IndexedDbConfig,
) => {
  const cached = await readPersistedState(config)
  if (cached?.version === cacheVersion && cached.state) {
    hydrate(queryClient, cached.state as any)
  }
}

const persistSnapshot = async (
  queryClient: QueryClient,
  cacheVersion: number,
  shouldDehydrateQuery: NonNullable<DehydrateOptions['shouldDehydrateQuery']>,
  localStorageKey: string,
  indexedDbConfig: IndexedDbConfig,
) => {
  const state = dehydrate(queryClient, { shouldDehydrateQuery })
  const payload = JSON.stringify({ version: cacheVersion, state })
  window.localStorage.setItem(localStorageKey, payload)
  await writePersistedState(indexedDbConfig, { version: cacheVersion, state })
}

export const createQueryCachePersistence = ({
  queryClient,
  cacheVersion,
  shouldDehydrateQuery,
  localStorageKey,
  indexedDb,
}: CreateQueryCachePersistenceParams) => {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return

  try {
    hydrateFromLocal(queryClient, cacheVersion, localStorageKey)
  } catch (error) {
    console.error('Failed to hydrate query cache from localStorage', error)
  }

  void hydrateFromIndexedDb(queryClient, cacheVersion, indexedDb).catch(
    (error) => {
      console.error('Failed to hydrate query cache from IndexedDB', error)
    },
  )

  const persist = () =>
    void persistSnapshot(
      queryClient,
      cacheVersion,
      shouldDehydrateQuery,
      localStorageKey,
      indexedDb,
    ).catch((error) => {
      console.error('Failed to persist query cache', error)
    })

  const unsubscribeQuery = queryClient.getQueryCache().subscribe(persist)
  const unsubscribeMutation = queryClient.getMutationCache().subscribe(persist)

  const handleBeforeUnload = () => persist()
  window.addEventListener('beforeunload', handleBeforeUnload)

  return () => {
    unsubscribeQuery()
    unsubscribeMutation()
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
}
