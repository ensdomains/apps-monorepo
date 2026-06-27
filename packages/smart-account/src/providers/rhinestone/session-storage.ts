/**
 * Session storage — localStorage persistence for Rhinestone HCA sessions.
 *
 * NOTE: "session" is NOT ERC-7579 SmartSessions. It is an ephemeral key added
 * as a time-boxed owner of the HCA's OwnableValidator (see ./registration-policy.ts).
 *
 * The ephemeral session key (and metadata: address, expiry, owner, chain) is
 * stored here, keyed by smart-account (HCA) address, so a session is reused
 * across Intents and across page reloads (persistent session). The owner only
 * signs the ENABLE Intent once per stored session.
 *
 * Storage-key versioning: the key is bumped whenever the stored-session SHAPE
 * changes, so stale rows from an incompatible layout are ignored rather than
 * mis-deserialized. Old rows are harmless cruft; a fresh session is enabled
 * lazily on the next registration with a single ENABLE prompt.
 *
 *   v4 → v5: dropped the obsolete SmartSessions fields (`enableSignature`,
 *            action set / PermissionId, etc.). The HCA does NOT use
 *            SmartSessions — a session is just a time-boxed owner added to the
 *            OwnableValidator — so the record now only needs the ephemeral key
 *            and its expiry. See ./registration-policy.ts.
 */

import type { Address } from 'viem'
import type { RhinestoneStoredSession } from './types'

const SESSION_STORAGE_KEY = 'ens-sessions-v5'
const SKIPPED_SESSION_KEY = 'ens-session-skipped'

const hasWindow = (): boolean => typeof window !== 'undefined'

/** Get all stored sessions. */
export function getAllSessions(): readonly RhinestoneStoredSession[] {
  if (!hasWindow()) return []
  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!data) return []
    const sessions = JSON.parse(data) as RhinestoneStoredSession[]
    return Array.isArray(sessions) ? sessions : []
  } catch {
    return []
  }
}

/** Get a session by smart-account (HCA) address. */
export function getSession(
  accountAddress: Address,
): RhinestoneStoredSession | null {
  const normalized = accountAddress.toLowerCase()
  return (
    getAllSessions().find(
      (s) => s.smartAccountAddress.toLowerCase() === normalized,
    ) ?? null
  )
}

/** Get a session by owner EOA address. */
export function getSessionByOwner(
  ownerAddress: Address,
): RhinestoneStoredSession | null {
  const normalized = ownerAddress.toLowerCase()
  return (
    getAllSessions().find((s) => s.ownerAddress.toLowerCase() === normalized) ??
    null
  )
}

/** Save a session, replacing any existing session for the same account. */
export function saveSession(session: RhinestoneStoredSession): void {
  if (!hasWindow()) return
  const normalized = session.smartAccountAddress.toLowerCase()
  const next: RhinestoneStoredSession[] = [
    ...getAllSessions().filter(
      (s) => s.smartAccountAddress.toLowerCase() !== normalized,
    ),
    session,
  ]
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/** Remove a session by smart-account address. */
export function removeSession(accountAddress: Address): void {
  if (!hasWindow()) return
  const normalized = accountAddress.toLowerCase()
  const next = getAllSessions().filter(
    (s) => s.smartAccountAddress.toLowerCase() !== normalized,
  )
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/** Remove all sessions for an owner EOA. */
export function removeSessionsByOwner(ownerAddress: Address): void {
  if (!hasWindow()) return
  const normalized = ownerAddress.toLowerCase()
  const next = getAllSessions().filter(
    (s) => s.ownerAddress.toLowerCase() !== normalized,
  )
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/** Clear all stored sessions. */
export function clearAllSessions(): void {
  if (!hasWindow()) return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

/** Read whether a user has skipped session creation. */
export function getSkippedStatus(ownerAddress: Address): boolean {
  if (!hasWindow()) return false
  return (
    localStorage.getItem(
      `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
    ) === 'true'
  )
}

/** Persist whether a user has skipped session creation. */
export function setSkippedStatus(
  ownerAddress: Address,
  skipped: boolean,
): void {
  if (!hasWindow()) return
  const key = `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`
  if (skipped) localStorage.setItem(key, 'true')
  else localStorage.removeItem(key)
}

/**
 * Client-side expiry check — a UX preflight that evicts stale rows and
 * surfaces a re-enable prompt before the user spends an Intent. The actual
 * expiry boundary is enforced on-chain by the owner's `uint48` expiration in
 * the OwnableValidator (an expired owner is excluded from signature validation).
 * Returns `false` for sessions with no `validUntil` (treat as non-expiring).
 */
export function isSessionExpired(session: RhinestoneStoredSession): boolean {
  if (!session.validUntil) return false
  return Date.now() > session.validUntil * 1000
}

/** Get a non-expired session for an account, evicting it on expiry. */
export function getValidSession(
  accountAddress: Address,
): RhinestoneStoredSession | null {
  const session = getSession(accountAddress)
  if (!session) return null
  if (isSessionExpired(session)) {
    removeSession(accountAddress)
    return null
  }
  return session
}

/** Get a non-expired session by owner EOA, evicting it on expiry. */
export function getValidSessionByOwner(
  ownerAddress: Address,
): RhinestoneStoredSession | null {
  const session = getSessionByOwner(ownerAddress)
  if (!session) return null
  if (isSessionExpired(session)) {
    removeSession(session.smartAccountAddress)
    return null
  }
  return session
}

export interface SessionScope {
  readonly accountAddress: Address
  readonly ownerAddress: Address
  readonly chainId: number
}

/**
 * Get a non-expired session scoped to a specific HCA, verifying that it was
 * created for the SAME owner and chain before reuse.
 *
 * Sessions are keyed by `smartAccountAddress`, but an owner-keyed lookup can
 * return a session for a different HCA/chain — its ephemeral key is NOT an
 * owner of the current HCA, so reusing it would skip ENABLE and then fail
 * intent simulation. This lookup pins all three identifiers; on any mismatch
 * (or expiry) it evicts the stale row and returns `null` so the caller creates
 * a fresh session.
 */
export function getValidSessionForAccount(
  scope: SessionScope,
): RhinestoneStoredSession | null {
  const session = getValidSession(scope.accountAddress)
  if (!session) return null

  const ownerMatches =
    session.ownerAddress.toLowerCase() === scope.ownerAddress.toLowerCase()
  const chainMatches = session.chainId === scope.chainId
  if (!ownerMatches || !chainMatches) {
    removeSession(scope.accountAddress)
    return null
  }
  return session
}
