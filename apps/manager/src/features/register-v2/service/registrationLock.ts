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
const STORAGE_KEY = 'ens-registration-lock-v1'

/**
 * A holder that stops refreshing is treated as gone. Long enough to survive a
 * reload and a slow render, short enough that a crashed tab frees the wallet
 * quickly. The holder refreshes well inside this window.
 */
const STALE_AFTER_MS = 60_000

export const REGISTRATION_LOCK_REFRESH_MS = 15_000

export type RegistrationLock = {
  readonly owner: string
  readonly name: string
  readonly updatedAt: number
}

const readLock = (): RegistrationLock | null => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<RegistrationLock>
    if (
      typeof parsed?.owner !== 'string' ||
      typeof parsed?.name !== 'string' ||
      typeof parsed?.updatedAt !== 'number'
    ) {
      return null
    }

    return parsed as RegistrationLock
  } catch {
    return null
  }
}

const writeLock = (lock: RegistrationLock): void => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lock))
  } catch {
    // A wallet that can't hold the lock still registers; it just loses the
    // cross-tab guard, which is strictly better than blocking the flow.
  }
}

const isSameHolder = (
  lock: RegistrationLock,
  owner: Address,
  name: string,
): boolean =>
  lock.owner.toLowerCase() === owner.toLowerCase() && lock.name === name

const isStale = (lock: RegistrationLock, now: number): boolean =>
  now - lock.updatedAt >= STALE_AFTER_MS

/**
 * The name currently registering on this wallet in another tab, if any.
 * Re-entrant for `name` itself, so a reload resumes its own registration.
 */
export const getBlockingRegistration = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): string | null => {
  const lock = readLock()

  if (!lock || isStale(lock, now)) return null
  if (lock.owner.toLowerCase() !== owner.toLowerCase()) return null

  return isSameHolder(lock, owner, name) ? null : lock.name
}

/** Claim the wallet for `name`, unless another name already holds it. */
export const acquireRegistrationLock = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): boolean => {
  if (getBlockingRegistration(owner, name, now) !== null) return false

  writeLock({ owner, name, updatedAt: now })
  return true
}

/** Keep the claim alive while the registration runs. */
export const refreshRegistrationLock = (
  owner: Address,
  name: string,
  now: number = Date.now(),
): void => {
  const lock = readLock()
  if (!lock || !isSameHolder(lock, owner, name)) return

  writeLock({ owner, name, updatedAt: now })
}

/** Release the claim. A lock held by anything else is left alone. */
export const releaseRegistrationLock = (owner: Address, name: string): void => {
  if (typeof window === 'undefined') return

  const lock = readLock()
  if (!lock || !isSameHolder(lock, owner, name)) return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the record goes stale on its own.
  }
}
