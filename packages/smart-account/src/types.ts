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
   * Start timestamp (unix seconds).
   *
   * On-chain enforcement via the per-action `time-frame` policy. Must
   * round-trip through session storage so signer-reconstruction produces
   * the same PermissionId.
   *
   * Optional for backwards compatibility with pre-time-frame sessions.
   */
  readonly validAfter?: number
  /**
   * Expiry timestamp (unix seconds).
   *
   * Used by on-chain `time-frame` policy enforcement AND the client-side
   * staleness check (`restoreRhinestoneSession` / `isSessionExpired`).
   * Both must agree on the same value for the PermissionId to be
   * reproducible at signer-construction time.
   *
   * Optional for backwards compatibility — newly created sessions always
   * populate it.
   */
  readonly validUntil?: number
  /** Session private key (hex) for signing */
  readonly sessionPrivateKey: Hex
}
