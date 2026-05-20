/**
 * Session Storage
 *
 * Handles localStorage persistence for Rhinestone smart sessions.
 * Sessions are keyed by smart account address for easy lookup.
 */

import type { Address } from 'viem'
import type { StoredSession } from './types'

// Storage for Rhinestone smart-session credentials. A previous
// rhinestone smart-session policy pinned `register.owner == SCA`; the
// current policy pins `register.owner == EOA`, which changes the
// action-set hash → PermissionId, so the key was bumped from v1 to
// invalidate any sessions stored under the prior policy. Old key
// contents are harmless cruft; a new session is re-enabled lazily on
// the next registration with a single wallet prompt.
const SESSION_STORAGE_KEY = 'ens-sessions-v2'
const SKIPPED_SESSION_KEY = 'ens-session-skipped'

/**
 * Get all stored sessions from localStorage
 */
export function getAllSessions(): StoredSession[] {
  if (typeof window === 'undefined') return []

  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!data) return []

    const sessions = JSON.parse(data) as StoredSession[]
    return Array.isArray(sessions) ? sessions : []
  } catch (error) {
    console.error('Failed to parse stored sessions:', error)
    return []
  }
}

/**
 * Get a session by smart account address
 */
export function getSession(accountAddress: Address): StoredSession | null {
  const sessions = getAllSessions()
  const normalizedAddress = accountAddress.toLowerCase()

  return (
    sessions.find(
      (s) => s.smartAccountAddress.toLowerCase() === normalizedAddress,
    ) ?? null
  )
}

/**
 * Get a session by owner EOA address
 */
export function getSessionByOwner(ownerAddress: Address): StoredSession | null {
  const sessions = getAllSessions()
  const normalizedAddress = ownerAddress.toLowerCase()

  return (
    sessions.find((s) => s.ownerAddress.toLowerCase() === normalizedAddress) ??
    null
  )
}

/**
 * Save a session to localStorage
 * Replaces any existing session for the same smart account
 */
export function saveSession(session: StoredSession): void {
  if (typeof window === 'undefined') return

  try {
    const sessions = getAllSessions()
    const normalizedAddress = session.smartAccountAddress.toLowerCase()

    // Remove existing session for this account
    const filteredSessions = sessions.filter(
      (s) => s.smartAccountAddress.toLowerCase() !== normalizedAddress,
    )

    // Add new session
    filteredSessions.push(session)

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filteredSessions))

    console.log('✅ Session saved for account:', session.smartAccountAddress)
  } catch (error) {
    console.error('Failed to save session:', error)
    throw new Error('Failed to save session to localStorage')
  }
}

/**
 * Remove a session by smart account address
 */
export function removeSession(accountAddress: Address): void {
  if (typeof window === 'undefined') return

  try {
    const sessions = getAllSessions()
    const normalizedAddress = accountAddress.toLowerCase()

    const filteredSessions = sessions.filter(
      (s) => s.smartAccountAddress.toLowerCase() !== normalizedAddress,
    )

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filteredSessions))

    console.log('🗑️ Session removed for account:', accountAddress)
  } catch (error) {
    console.error('Failed to remove session:', error)
  }
}

/**
 * Remove all sessions for an owner EOA
 */
export function removeSessionsByOwner(ownerAddress: Address): void {
  if (typeof window === 'undefined') return

  try {
    const sessions = getAllSessions()
    const normalizedAddress = ownerAddress.toLowerCase()

    const filteredSessions = sessions.filter(
      (s) => s.ownerAddress.toLowerCase() !== normalizedAddress,
    )

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filteredSessions))

    console.log('🗑️ Sessions removed for owner:', ownerAddress)
  } catch (error) {
    console.error('Failed to remove sessions:', error)
  }
}

/**
 * Clear all stored sessions
 */
export function clearAllSessions(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    console.log('🗑️ All sessions cleared')
  } catch (error) {
    console.error('Failed to clear sessions:', error)
  }
}

/**
 * Read whether a user has skipped session creation.
 */
export function getSkippedStatus(ownerAddress: Address): boolean {
  if (typeof window === 'undefined') return false

  try {
    const value = localStorage.getItem(
      `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
    )
    return value === 'true'
  } catch (error) {
    console.error('Failed to read skipped session status:', error)
    return false
  }
}

/**
 * Persist whether a user has skipped session creation.
 */
export function setSkippedStatus(
  ownerAddress: Address,
  skipped: boolean,
): void {
  if (typeof window === 'undefined') return

  try {
    const key = `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`
    if (skipped) {
      localStorage.setItem(key, 'true')
    } else {
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.error('Failed to persist skipped session status:', error)
  }
}

/**
 * Check if a session is expired
 */
export function isSessionExpired(session: StoredSession): boolean {
  if (!session.validUntil) return false
  return Date.now() > session.validUntil * 1000
}

/**
 * Get a valid (non-expired) session for an account
 */
export function getValidSession(accountAddress: Address): StoredSession | null {
  const session = getSession(accountAddress)
  if (!session) return null
  if (isSessionExpired(session)) {
    removeSession(accountAddress)
    return null
  }
  return session
}

/**
 * Get a valid session by owner address
 */
export function getValidSessionByOwner(
  ownerAddress: Address,
): StoredSession | null {
  const session = getSessionByOwner(ownerAddress)
  if (!session) return null
  if (isSessionExpired(session)) {
    removeSession(session.smartAccountAddress)
    return null
  }
  return session
}
