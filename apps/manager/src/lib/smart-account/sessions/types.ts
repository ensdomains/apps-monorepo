/**
 * Session Types for ZeroDev Smart Sessions
 *
 * Defines the structure for storing and managing session keys.
 * Sessions use sudo policy for unrestricted access (security to be added later).
 */

import type { Address, Hex } from 'viem'

/**
 * Session configuration options
 */
export interface SessionConfig {
  /** Optional expiry timestamp (default: no expiry) */
  validUntil?: number
}

/**
 * Stored session data persisted to localStorage
 */
export interface StoredSession {
  /** Unique session identifier */
  id: string
  /** Address of the session key */
  sessionKeyAddress: Address
  /** Smart account address this session controls */
  smartAccountAddress: Address
  /** EOA owner address that created the session */
  ownerAddress: Address
  /** Unix timestamp when session was created */
  createdAt: number
  /** Chain ID the session is valid for */
  chainId: number
  /** Optional expiry timestamp */
  validUntil?: number
  /** Serialized session account data from ZeroDev SDK */
  serializedSessionAccount: string
  /** Session private key (hex) for signing */
  sessionPrivateKey: Hex
}

/**
 * Session state for React hooks
 */
export interface SessionState {
  /** Current session status */
  status: 'none' | 'creating' | 'active' | 'expired' | 'error'
  /** Active session if any */
  session: StoredSession | null
  /** Error message if status is 'error' */
  error?: string
}

/**
 * Result type for session operations
 */
export type SessionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
