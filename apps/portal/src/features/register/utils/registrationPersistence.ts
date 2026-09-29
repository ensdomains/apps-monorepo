/**
 * localStorage backing for an interrupted registration.
 *
 * The package (`@ens-apps/transaction-manager`) owns the record and its codec.
 * Unlike the manager, the portal needs nothing beyond it to rebuild the page:
 * name, duration, token, price and owner are all in the record's context, so
 * the package record is stored as-is.
 *
 * One record, last-writer-wins, and best-effort throughout: a private-mode
 * browser or a full quota costs the user resume, never the registration.
 */

import {
  type PersistedRegistrationRecord,
  parseRegistrationRecord,
  type RegistrationPersistenceAdapter,
  serializeRegistrationRecord,
} from '@ens-apps/transaction-manager'

const STORAGE_KEY = 'ens-apps:portal:register:resume:v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const getBrowserStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * The stored record, or null for every failure mode: absent, unreadable
 * storage, corrupt JSON, or a record the package codec rejects (old schema,
 * protocol drift). Callers treat all of them as "nothing to resume".
 */
export const loadStoredRegistration = (
  storage: StorageLike | null = getBrowserStorage(),
): PersistedRegistrationRecord | null => {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
  if (!raw) return null

  return parseRegistrationRecord(raw).unwrapOr(null)
}

export const clearStoredRegistration = (
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // A record we cannot delete is one the preflight rejects anyway.
  }
}

/** The adapter `subscribeRegistrationPersistence` writes through. */
export const createRegistrationPersistenceAdapter = (
  storage: StorageLike | null = getBrowserStorage(),
): RegistrationPersistenceAdapter => ({
  save(record) {
    try {
      storage?.setItem(STORAGE_KEY, serializeRegistrationRecord(record))
    } catch {
      // Quota or private mode. The user loses resume, not the registration.
    }
  },
  load: () => loadStoredRegistration(storage),
  clear: () => clearStoredRegistration(storage),
})
