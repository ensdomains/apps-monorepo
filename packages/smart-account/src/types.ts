/**
 * Cross-provider smart-account types.
 *
 * Only provider-agnostic shapes live here. Provider-specific session
 * shapes (e.g. `RhinestoneStoredSession`) live under
 * `providers/<provider>/types.ts` and extend `BaseStoredSession`.
 */

import type { Address, Hex } from 'viem'

/**
 * Common fields for any provider-tagged stored session.
 */
export interface BaseStoredSession {
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
  /**
   * Expiry timestamp (unix seconds).
   *
   * Used by provider session-restore helpers (e.g.
   * `restoreRhinestoneSession`) and `isSessionExpired` to detect stale
   * rows in localStorage and prompt for a fresh enable. This is a
   * **client-side check only** — the matching on-chain `time-frame`
   * policy is currently disabled due to a Rhinestone SDK ↔ deployed-
   * contract initData mismatch (see
   * `providers/rhinestone/registration-policy.ts` for the full
   * diagnosis). A stolen key remains usable for the full session
   * lifetime from any client until upstream is fixed.
   *
   * Optional only for backwards compatibility with the type — newly
   * created sessions always populate it.
   */
  readonly validUntil?: number
  /** Session private key (hex) for signing */
  readonly sessionPrivateKey: Hex
}
