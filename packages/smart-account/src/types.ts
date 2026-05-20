/**
 * Rhinestone session types
 *
 * Provider-tagged stored session shape persisted to localStorage by consuming
 * apps. Mirrors the rhinestone-specific subset of what was previously the
 * `StoredSession` union in `apps/manager/src/lib/smart-account/sessions/types.ts`.
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
  /** Optional expiry timestamp (seconds) */
  readonly validUntil?: number
  /** Session private key (hex) for signing */
  readonly sessionPrivateKey: Hex
}

/**
 * Rhinestone session — uses Rhinestone SDK's session config with on-chain
 * enablement data. Created by `createRhinestoneSession` and consumed by
 * `restoreRhinestoneSession` + signer construction at the app boundary.
 */
export interface RhinestoneStoredSession extends BaseStoredSession {
  readonly provider: 'rhinestone'
  /** JSON-serialized RhinestoneSessionConfig */
  readonly sessionConfig: string
  /** Owner signature from experimental_signEnableSession (one-time enablement) */
  readonly enableSignature: Hex
  /**
   * JSON-serialized array of { chainId: string; sessionDigest: Hex }.
   * chainId is stored as string because bigint is not JSON-serializable.
   */
  readonly hashesAndChainIds: string
}

/**
 * Type guard for Rhinestone sessions.
 *
 * Generic over the broader stored-session union owned by the host app, so
 * consumers do not have to depend on a specific union shape from this
 * package.
 */
export function isRhinestoneSession<T extends { provider?: string }>(
  session: T,
): session is T & RhinestoneStoredSession {
  return session.provider === 'rhinestone'
}
