/**
 * Rhinestone-specific session types.
 *
 * Lives under `providers/rhinestone/` so any provider-specific session
 * shape stays scoped to its provider. The shared/cross-provider
 * `BaseStoredSession` lives at the package root in `../../types.ts`.
 */

import type { Hex } from 'viem'
import type { BaseStoredSession } from '../../types'

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
