import type { Address } from 'viem'

/**
 * The session nonce each HCA was last reset to from this browser, so a reload
 * doesn't offer a reset that would revoke nothing. Kept under `ens-session*`
 * so a disconnect doesn't wipe it (`clearAppLocalStorage`).
 */
const STORAGE_KEY = 'ens-session-reset-v1'

/** Decimal nonces by `chainId:account`. */
type SessionResets = Readonly<Record<string, string>>
type SessionResetChanges = Readonly<Record<string, string | null>>
type PendingSessionResets = {
  readonly snapshot: SessionResets
  readonly changes: SessionResetChanges
}

const isDecimal = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value)

const keyFor = (chainId: number, account: Address) =>
  `${chainId}:${account.toLowerCase()}`

// Unpersisted changes override only their keys; snapshots cover unavailable reads.
let pendingResets: PendingSessionResets | null = null

const applyChanges = (
  resets: SessionResets,
  changes: SessionResetChanges,
): SessionResets =>
  Object.entries(changes).reduce<SessionResets>(
    (current, [key, nonce]) =>
      nonce === null
        ? Object.fromEntries(
            Object.entries(current).filter(([storedKey]) => storedKey !== key),
          )
        : { ...current, [key]: nonce },
    resets,
  )

const parseResets = (raw: string | null): SessionResets => {
  if (!raw) return {}

  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SessionResets)
      : {}
  } catch {
    return {}
  }
}

const readStoredResets = (): SessionResets | null => {
  if (typeof window === 'undefined') return null

  try {
    return parseResets(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

const readAll = (): SessionResets => {
  const stored = readStoredResets()
  if (!pendingResets) return stored ?? {}

  const snapshot = applyChanges(
    stored ?? pendingResets.snapshot,
    pendingResets.changes,
  )
  pendingResets = { ...pendingResets, snapshot }
  return snapshot
}

// Writes in this tab; other tabs hear about them through the `storage` event.
let listeners: ReadonlySet<() => void> = new Set()

// Best-effort: without storage, a reload just offers the reset again.
const writeAll = (changes: SessionResetChanges): void => {
  if (typeof window === 'undefined') return

  const stored = readStoredResets()
  const pendingChanges = { ...pendingResets?.changes, ...changes }
  const snapshot = applyChanges(
    stored ?? pendingResets?.snapshot ?? {},
    pendingChanges,
  )
  const pending = { snapshot, changes: pendingChanges }

  // Never overwrite a base that could not be read.
  if (stored === null) {
    pendingResets = pending
  } else {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      pendingResets = null
    } catch {
      pendingResets = pending
    }
  }
  for (const listener of listeners) listener()
}

/** Calls back whenever the saved resets change, in this tab or another. */
export const subscribeSessionResets = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }
  listeners = new Set([...listeners, onChange])
  window.addEventListener('storage', onStorage)
  return () => {
    listeners = new Set(
      [...listeners].filter((listener) => listener !== onChange),
    )
    window.removeEventListener('storage', onStorage)
  }
}

export const readSessionResetNonce = (
  chainId: number,
  account: Address,
): bigint | null => {
  const stored: unknown = readAll()[keyFor(chainId, account)]
  return isDecimal(stored) ? BigInt(stored) : null
}

export const saveSessionReset = (
  chainId: number,
  account: Address,
  sessionNonce: bigint,
): void => {
  writeAll({ [keyFor(chainId, account)]: sessionNonce.toString() })
}

export const clearSessionReset = (chainId: number, account: Address): void => {
  const key = keyFor(chainId, account)
  if (!(key in readAll())) return
  writeAll({ [key]: null })
}
