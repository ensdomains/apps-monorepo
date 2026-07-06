/**
 * Rhinestone-specific session types.
 *
 * Lives under `providers/rhinestone/` so any provider-specific session
 * shape stays scoped to its provider. The shared/cross-provider
 * `BaseStoredSession` lives at the package root in `../../types.ts`.
 */

import type { BaseStoredSession } from '../../types'

/**
 * Rhinestone HCA session (owner-key model). The ephemeral key
 * (`sessionPrivateKey` / `sessionKeyAddress`) is added as a time-boxed HCA
 * owner; it then signs Intents directly. No enable signature or digest data
 * is needed (unlike a SmartSessions/Emissary session) — the add-owner Intent
 * is what enables it on-chain.
 */
export interface RhinestoneStoredSession extends BaseStoredSession {
  readonly provider: 'rhinestone'
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
