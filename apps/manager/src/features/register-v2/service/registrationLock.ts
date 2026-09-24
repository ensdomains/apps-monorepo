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

const writeLocks = (locks: RegistrationLocks): void => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locks))
  } catch {
    // A wallet that can't hold the lock still registers; it just loses the
    // cross-tab guard, which is better than blocking the flow outright.
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
 * The registration holding this wallet in another tab, if any.
 *
 * Matched on the holder, not the name: a reload resumes its own registration,
 * while a second tab is blocked even when it is registering the same name.
 */
export const getBlockingRegistration = (
  owner: Address,
  now: number = Date.now(),
): string | null => {
  const lock = readLock(owner)

  if (!isLive(lock, now) || !lock) return null

  return lock.holderId === getHolderId() ? null : lock.name
}

/**
 * Claim the wallet for `name`. The write is read back, so when two tabs claim
 * at once the loser sees the winner's record and reports failure rather than
 * both proceeding on the same permit nonce.
 */
export const acquireRegistrationLock = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): boolean => {
  if (getBlockingRegistration(owner, now) !== null) return false

  const key = owner.toLowerCase()
  const holderId = getHolderId()

  writeLocks({ ...readLocks(), [key]: { name, holderId, updatedAt: now } })

  return readLock(owner)?.holderId === holderId
}

/** Keep the claim alive while the registration runs. */
export const refreshRegistrationLock = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): void => {
  const lock = readLock(owner)
  if (!lock || lock.holderId !== getHolderId()) return

  const key = owner.toLowerCase()
  writeLocks({
    ...readLocks(),
    [key]: { name, holderId: lock.holderId, updatedAt: now },
  })
}

/** Release the claim. A claim held by another tab is left alone. */
export const releaseRegistrationLock = (owner: Address): void => {
  const lock = readLock(owner)
  if (!lock || lock.holderId !== getHolderId()) return

  const { [owner.toLowerCase()]: _released, ...rest } = readLocks()
  writeLocks(rest)
}
