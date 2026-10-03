import type { Address } from 'viem'

/**
 * One registration at a time per wallet, across tabs.
 *
 * The commit batch funds the HCA with an EIP-2612 permit, and that nonce is
 * sequential per wallet. Two tabs read the same nonce, both sign for it, and
 * whichever commit lands second reverts `TransferFromFailed()` inside an atomic
 * batch, so its commitment is never recorded. The wallet's USDC balance is
 * preflighted per tab too, so concurrent runs can also collectively overdraw a
 * balance each one individually cleared.
 */
const STORAGE_KEY = 'ens-registration-locks-v1'

/** Identifies the tab, not the name: `sessionStorage` is per tab and survives reload. */
const HOLDER_KEY = 'ens-registration-holder'

/**
 * A holder that stops refreshing is treated as gone. Long enough to survive a
 * reload and a slow render, short enough that a crashed tab frees the wallet
 * quickly. The holder refreshes well inside this window.
 */
const STALE_AFTER_MS = 60_000

export const REGISTRATION_LOCK_REFRESH_MS = 15_000

export type RegistrationLock = {
  readonly name: string
  readonly holderId: string
  readonly updatedAt: number
}

/** Locks by lowercased wallet, so one wallet's claim can't evict another's. */
type RegistrationLocks = Record<string, RegistrationLock>

const readLocks = (): RegistrationLocks => {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as RegistrationLocks)
      : {}
  } catch {
    return {}
  }
}

/** Whether the write landed. A wallet that can't be locked still registers. */
const writeLocks = (locks: RegistrationLocks): boolean => {
  if (typeof window === 'undefined') return false

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locks))
    return true
  } catch {
    return false
  }
}

/** This tab's id, stable across reloads and distinct from every other tab. */
export const getHolderId = (): string => {
  if (typeof window === 'undefined') return 'server'

  try {
    const existing = window.sessionStorage.getItem(HOLDER_KEY)
    if (existing) return existing

    const created = crypto.randomUUID()
    window.sessionStorage.setItem(HOLDER_KEY, created)
    return created
  } catch {
    // Without per-tab storage every tab looks like the same holder, which only
    // relaxes the guard back to name-based re-entrancy.
    return 'fallback'
  }
}

const readLock = (owner: Address): RegistrationLock | undefined =>
  readLocks()[owner.toLowerCase()]

const isLive = (lock: RegistrationLock | undefined, now: number): boolean =>
  !!lock && now - lock.updatedAt < STALE_AFTER_MS

/**
 * A registration attempt is this tab registering this name. A reload resumes
 * it; a second tab, or a different name in the same tab, is a different one.
 */
const isOwnAttempt = (lock: RegistrationLock, name: string): boolean =>
  lock.holderId === getHolderId() && lock.name === name

/** The registration holding this wallet, if it isn't this attempt's own claim. */
export const getBlockingRegistration = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): string | null => {
  const lock = readLock(owner)

  if (!lock || !isLive(lock, now)) return null

  return isOwnAttempt(lock, name) ? null : lock.name
}

/**
 * Claim the wallet for `name`. The write is read back, so when two tabs claim
 * at once the loser sees the winner's record and reports failure rather than
 * both proceeding on the same permit nonce. A write that fails outright means
 * storage is unavailable, so the claim is granted without the guard.
 */
export const acquireRegistrationLock = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): boolean => {
  if (getBlockingRegistration(owner, name, now) !== null) return false

  const key = owner.toLowerCase()
  const holderId = getHolderId()

  const written = writeLocks({
    ...readLocks(),
    [key]: { name, holderId, updatedAt: now },
  })
  if (!written) return true

  const stored = readLock(owner)
  return !!stored && isOwnAttempt(stored, name)
}

/** Keep the claim alive while the registration runs. */
export const refreshRegistrationLock = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): void => {
  const lock = readLock(owner)
  if (!lock || !isOwnAttempt(lock, name)) return

  writeLocks({
    ...readLocks(),
    [owner.toLowerCase()]: { ...lock, updatedAt: now },
  })
}

/**
 * Release this tab's claim on the wallet. Matched on the holder only: one tab
 * runs one registration, so whatever name it holds is the one being abandoned.
 * A claim held by another tab is left alone.
 */
export const releaseRegistrationLock = (owner: Address): void => {
  const lock = readLock(owner)
  if (!lock || lock.holderId !== getHolderId()) return

  const { [owner.toLowerCase()]: _released, ...rest } = readLocks()
  writeLocks(rest)
}

/**
 * Drop every claim this tab holds. Called when the registration flow mounts or
 * unmounts: a tab that is not mid-registration cannot legitimately hold one, so
 * a reload or a route change frees the wallet instead of waiting out staleness.
 */
export const releaseHolderLocks = (): void => {
  const holderId = getHolderId()
  const locks = readLocks()
  const rest = Object.fromEntries(
    Object.entries(locks).filter(([, lock]) => lock.holderId !== holderId),
  )
  if (Object.keys(rest).length !== Object.keys(locks).length) writeLocks(rest)
}
