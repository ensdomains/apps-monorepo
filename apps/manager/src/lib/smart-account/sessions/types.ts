/**
 * Session Types for Smart Sessions
 *
 * Defines the structure for storing and managing session keys.
 * Only Rhinestone sessions are supported; the canonical types live in
 * `@ens-apps/smart-account` and are re-exported here for a single import
 * point inside the app.
 */

import {
  isRhinestoneSession,
  type RhinestoneStoredSession,
} from '@ens-apps/smart-account'

export { isRhinestoneSession }
export type { RhinestoneStoredSession }

/**
 * Session configuration options
 */
export interface SessionConfig {
  /** Optional expiry timestamp (default: no expiry) */
  validUntil?: number
}

/**
 * Stored session — Rhinestone is the only supported provider.
 */
export type StoredSession = RhinestoneStoredSession

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
