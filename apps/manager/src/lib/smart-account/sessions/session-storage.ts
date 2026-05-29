/**
 * Session Storage
 *
 * Handles localStorage persistence for Rhinestone smart sessions.
 * Sessions are keyed by smart account address for easy lookup.
 */

import type { Address } from 'viem'
import type { StoredSession } from './types'

// Storage for Rhinestone smart-session credentials.
//
// Key history:
//   v1 → v2: pinned `register.owner == EOA` (was SCA), changing the
//            action-set hash → PermissionId.
//   v2 → v3: added a `time-frame` policy to every action so on-chain
//            enforcement matches the client-side `validUntil`. Again
//            changed the action-set hash → PermissionId.
//   v3 → v4: removed the `time-frame` policy. Rhinestone SDK 1.5.1's
//            `'time-frame'` encoder produces 12-byte initData but the
//            deployed `TimeFramePolicy` on Sepolia expects 32 bytes
//            (rhinestonewtf/smartsessions fork with struct-based
//            config), so enable-mode simulation reverts on
//            `initializeWithMultiplexer`'s second `bytes16` slice. The
//            v3 action set is therefore on-chain-incompatible; bumping
//            the key forces a fresh enable that uses the v4 (no
//            time-frame) action set. See `build-registration-session.ts`
//            for the full diagnosis and the conditions for re-enabling.
//   v4 → v5: two simultaneous breaking changes invalidated every
//            stored session:
//              (a) the HCAFactory action was dropped from
//                  `registration-policy.ts` (the new `HCAFactory.sol`
//                  has no `setAccountOwner` selector — ownership is
//                  written atomically inside `createAccount`). The
//                  action set went from 7 actions to 6, changing the
//                  PermissionId.
//              (b) the canonical SCA address moved from the Rhinestone
//                  Nexus-derived CREATE2 address to the HCAFactory
//                  CREATE3 proxy at `computeAccountAddress(eoa)`. Old
//                  sessions are keyed by an account address that the
//                  new bootstrap will never produce again, so they
//                  could never be matched to a fresh user anyway.
//              (c) `@rhinestone/sdk@1.6.4 → 1.6.5` fixed
//                  `signEnableSession` to derive the EIP-712 signing
//                  chain from `hashesAndChainIds[0].chainId` instead
//                  of hardcoding mainnet. v4 sessions were signed
//                  against chainId=1; the on-chain emissary on Sepolia
//                  expects chainId=11155111. Replaying a v4
//                  enableSignature would fail wallet-side
//                  network-match checks and ultimately fail the on-chain
//                  signature check.
//            Bumping to v5 forces a single fresh wallet prompt for any
//            user with an old session, after which everything matches
//            the new factory + SDK + action-set.
//   v5 → v6: two changes invalidated every stored session:
//              (a) `RhinestoneStoredSession` grew a required
//                  `actionsHash` field — a keccak256 over the action
//                  set the session was signed against.
//                  `restoreRhinestoneSession` recomputes the hash with
//                  current code at load time and refuses to restore on
//                  mismatch, surfacing the equivalent of a future
//                  storage bump as a single fresh wallet prompt rather
//                  than an opaque `InvalidSignature()` deep inside a
//                  registration tx. v5 sessions don't carry the field
//                  so the version bump itself invalidates them; v6+
//                  sessions invalidate themselves on action-set drift
//                  without needing another storage bump.
//              (b) `buildRegistrationSessionActions` now normalizes the
//                  EOA to EIP-55 before writing it into UAP
//                  `referenceValue`. Old sessions whose enable
//                  signatures were computed against the un-normalized
//                  bytes hash to a different `PermissionId` than the
//                  on-chain validator reconstructs from the same
//                  config today, so they cannot be used and must be
//                  re-enabled. This was the root cause of orchestrator
//                  "Bundle simulation failed" 400s reported during the
//                  v5 cut.
//
// Each bump invalidates sessions stored under prior policies — using a
// stale `enableSignature` against a different PermissionId yields
// `InvalidSignature()` at orchestrator simulation time. Old key
// contents are harmless cruft; a new session is re-enabled lazily on
// the next registration with a single wallet prompt.
const SESSION_STORAGE_KEY = 'ens-sessions-v6'
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
 * Client-side expiry check used to evict expired rows from localStorage
 * and surface a "reconnect" prompt before the user spends a transaction.
 *
 * Today this is the **only** expiry bound — see
 * `@ens-apps/smart-account` (providers/rhinestone/registration-policy.ts) for why the
 * matching on-chain `time-frame` policy is disabled. A stolen session
 * key submitted from outside this dApp is not bound by this check;
 * only by `removeSession(permissionId)` revocation.
 *
 * Returns `false` for sessions with no `validUntil` set (treat as
 * non-expiring at the client level). Newly issued sessions always set
 * it, so this only matters for hand-tampered storage.
 */
export function isSessionExpired(session: StoredSession): boolean {
  if (!session.validUntil) return false
  return Date.now() > session.validUntil * 1000
}

/**
 * Get a non-stale session for an account, evicting it from localStorage
 * if its `validUntil` has passed. See {@link isSessionExpired} for the
 * caveat that this is currently the only expiry bound.
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
 * Get a non-stale session by owner EOA, evicting from localStorage on
 * expiry. Same client-side-only semantics as {@link getValidSession}.
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
