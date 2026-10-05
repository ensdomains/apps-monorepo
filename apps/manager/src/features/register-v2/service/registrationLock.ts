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

/** Where tabs settle which of them answers to a holder id. */
const HOLDER_CHANNEL = 'ens-registration-holder-claim'

/**
 * How long a live tab has to object to an id another tab just claimed. A
 * broadcast within one browser is delivered on the next task, so this only has
 * to outlast a message round trip, and it runs once when the flow mounts.
 */
const CLAIM_REPLY_WINDOW_MS = 250

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

type HolderMessage = {
  readonly type: 'claim' | 'taken'
  readonly holderId: string
  /**
   * On a claim: orders two tabs claiming the same id at once, lower first. A
   * reload racing its own duplicate would otherwise have both step aside,
   * leaving the live lock owned by neither tab and the wallet blocked until it
   * goes stale. Absent from a tab that has already settled, which always keeps
   * its id.
   *
   * On a `taken`: the rank of the claim being answered. With three tabs on one
   * id, the middle one answers the lowest-ranked claim, and the winner must
   * not read that reply as its own and step aside too.
   */
  readonly claimRank?: string
}

const isHolderMessage = (data: unknown): data is HolderMessage => {
  if (!data || typeof data !== 'object') return false

  const message = data as Record<string, unknown>
  return (
    (message.type === 'claim' || message.type === 'taken') &&
    typeof message.holderId === 'string' &&
    (message.claimRank === undefined || typeof message.claimRank === 'string')
  )
}

/**
 * Whether this tab keeps the id against a tab claiming it at the same moment.
 * Any total order will do; what matters is that exactly one side yields.
 */
const outranksClaim = (theirs: string | undefined, ours: string): boolean =>
  theirs === undefined ? false : ours < theirs

/** A fresh id for this tab, replacing whatever it inherited. */
const takeNewHolderId = (): string => {
  const created = crypto.randomUUID()

  try {
    window.sessionStorage.setItem(HOLDER_KEY, created)
  } catch {
    // Without per-tab storage the id cannot be remembered across a reload,
    // which only relaxes the guard back to name-based re-entrancy.
  }

  return created
}

let holderClaim: Promise<string> | undefined

/**
 * Settle this tab's holder id, and keep answering for it.
 *
 * "Duplicate tab" clones `sessionStorage`, holder id included, so the copy
 * reads as the tab it was cloned from: it frees that tab's claim on mount and
 * then registers alongside it, which is the race the lock exists to stop. The
 * tab already answering to the id says so, and the clone takes a new one.
 *
 * Resolved before any claim is released, never before one is read: an id that
 * cannot be broadcast (no `BroadcastChannel`) is left as it was.
 */
export const claimTabHolderId = (): Promise<string> => {
  holderClaim ??= new Promise<string>((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof BroadcastChannel === 'undefined'
    ) {
      resolve(getHolderId())
      return
    }

    let channel: BroadcastChannel
    try {
      channel = new BroadcastChannel(HOLDER_CHANNEL)
    } catch {
      resolve(getHolderId())
      return
    }

    const claimRank = crypto.randomUUID()
    // Cleared once settled, and a settled tab answers without a rank: it has
    // held the id long enough that a fresh claim on it is the clone's.
    let pendingRank: string | undefined = claimRank

    const settle = (holderId: string) => {
      pendingRank = undefined
      resolve(holderId)
    }

    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isHolderMessage(event.data)) return
      if (event.data.holderId !== getHolderId()) return

      if (event.data.type === 'claim') {
        // Yield to the other side of a simultaneous claim rather than answer
        // it: both tabs rotating would orphan the lock this id still holds.
        if (
          pendingRank !== undefined &&
          !outranksClaim(event.data.claimRank, pendingRank)
        ) {
          return
        }

        channel.postMessage({
          type: 'taken',
          holderId: getHolderId(),
          claimRank: event.data.claimRank,
        })
        return
      }

      // Addressed to another claimant, or to a claim this tab already settled.
      if (pendingRank === undefined || event.data.claimRank !== pendingRank) {
        return
      }

      // Another live tab already answers to this id, so this tab is the clone.
      settle(takeNewHolderId())
    })

    channel.postMessage({ type: 'claim', claimRank, holderId: getHolderId() })
    // Unanswered means nobody else holds it: a reload, or the first tab.
    window.setTimeout(() => settle(getHolderId()), CLAIM_REPLY_WINDOW_MS)
  })

  return holderClaim
}

/**
 * Drop this tab's claims once its identity has settled.
 *
 * Both ends of the flow's lifecycle go through here: a duplicated tab that
 * mounts and leaves inside the claim window would otherwise sweep with the id
 * it inherited, which is the live claim of the tab it was cloned from.
 */
export const releaseHolderLocksWhenSettled = (): Promise<void> => {
  const since = readLocks()

  return claimTabHolderId().then(() => releaseHolderLocks(since))
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
 *
 * `since` limits the sweep to the claims as they were when it was asked for.
 * One acquired or refreshed in the meantime is a live registration — the flow
 * left and came back, or never left — and is kept. Without that, a sweep that
 * waits for the holder id can land on a claim made during the wait.
 */
export const releaseHolderLocks = (since?: RegistrationLocks): void => {
  const holderId = getHolderId()
  const locks = readLocks()
  const rest = Object.fromEntries(
    Object.entries(locks).filter(([owner, lock]) => {
      if (lock.holderId !== holderId) return true
      if (!since) return false

      const seen = since[owner]
      return (
        !seen || seen.name !== lock.name || seen.updatedAt !== lock.updatedAt
      )
    }),
  )
  if (Object.keys(rest).length !== Object.keys(locks).length) writeLocks(rest)
}
