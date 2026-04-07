/**
 * Session Types for ZeroDev Smart Sessions
 *
 * Defines the structure for storing and managing session keys.
 * Sessions use sudo policy for unrestricted access (security to be added later).
 */

import type { Address, Hex } from 'viem'

export type SessionProvider = 'zerodev' | 'rhinestone'

export interface RhinestoneSessionConfigData {
  readonly provider: 'rhinestone'
  readonly chainId: number
}

/**
 * Session configuration options
 */
export interface SessionConfig {
  /** Optional expiry timestamp (default: no expiry) */
  validUntil?: number
}

interface BaseStoredSession {
  /** Unique session identifier */
  readonly id: string
  /** Address of the session key */
  readonly sessionKeyAddress: Address
  /** Smart account address this session controls */
  readonly smartAccountAddress: Address
  /** EOA owner address that created the session */
  readonly ownerAddress: Address
  /** Unix timestamp when session was created */
  readonly createdAt: number
  /** Chain ID the session is valid for */
  readonly chainId: number
  /** Optional expiry timestamp */
  readonly validUntil?: number
  /** Session private key (hex) for signing */
  readonly sessionPrivateKey: Hex
}

/**
 * ZeroDev session (existing format)
 * The `provider` field is optional for backwards compatibility with existing stored sessions
 */
export interface ZeroDevStoredSession extends BaseStoredSession {
  readonly provider?: 'zerodev'
  /** Serialized session account data from ZeroDev SDK */
  readonly serializedSessionAccount: string
}

/**
 * Rhinestone session (new format)
 * Uses Rhinestone SDK's session config with on-chain enablement data
 */
export interface RhinestoneStoredSession extends BaseStoredSession {
  readonly provider: 'rhinestone'
  /** JSON-serialized RhinestoneSessionConfigData */
  readonly sessionConfig: string
  /**
   * Transitional compatibility field for existing call-sites typed against
   * ZeroDev sessions while Rhinestone session handling is being adopted.
   */
  readonly serializedSessionAccount: string
  /** Owner signature from experimental_signEnableSession (one-time enablement) */
  readonly enableSignature: Hex
  /**
   * JSON-serialized array of { chainId: string; sessionDigest: Hex }.
   * chainId is stored as string because bigint is not JSON-serializable.
   */
  readonly hashesAndChainIds: string
}

export type StoredSession = ZeroDevStoredSession | RhinestoneStoredSession

/**
 * Type guard for ZeroDev sessions
 * Returns true if session is ZeroDev format (provider undefined or 'zerodev')
 */
export function isZeroDevSession(
  session: StoredSession,
): session is ZeroDevStoredSession {
  return session.provider === undefined || session.provider === 'zerodev'
}

/**
 * Type guard for Rhinestone sessions
 */
export function isRhinestoneSession(
  session: StoredSession,
): session is RhinestoneStoredSession {
  return session.provider === 'rhinestone'
}

/**
 * Get the provider for a stored session
 * Handles backwards compatibility where provider may be undefined
 */
export function getSessionProvider(session: StoredSession): SessionProvider {
  return session.provider ?? 'zerodev'
}

/**
 * Session state for React hooks
 */
export interface SessionState {
  /** Current session status */
  readonly status: 'none' | 'creating' | 'active' | 'expired' | 'error'
  /** Active session if any */
  readonly session: StoredSession | null
  /** Error message if status is 'error' */
  readonly error?: string
}

/**
 * Result type for session operations
 */
export type SessionResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string }
