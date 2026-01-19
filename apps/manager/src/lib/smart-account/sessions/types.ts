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
  /** Serialized session account data from ZeroDev SDK */
  readonly serializedSessionAccount: string
  /** Session private key (hex) for signing */
  readonly sessionPrivateKey: Hex
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
