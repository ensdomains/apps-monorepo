/**
 * Cross-provider smart-account types.
 *
 * Only provider-agnostic shapes live here. Provider-specific session
 * shapes (e.g. `RhinestoneStoredSession`) live under
 * `providers/<provider>/types.ts` and extend `BaseStoredSession`.
 */

import type { ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import type { SessionError } from './errors'

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

/**
 * Contract every smart-account provider implements.
 *
 * Today only `rhinestone` implements it; the contract exists so a
 * future second provider lands by adding a second implementation
 * rather than reshuffling the package. Consumers (the manager app)
 * can either depend on a concrete provider directly (current shape)
 * or on this contract once multi-provider support is needed.
 *
 * Type parameters:
 *   - `InitParams` — provider-specific account-init input shape
 *     (e.g. `InitializeRhinestoneAccountParams`).
 *   - `InitResult` — what `initializeAccount` resolves with
 *     (e.g. `RhinestoneInitResult`).
 *   - `CreateSessionParams` — provider-specific session-create input.
 *   - `Session` — provider's stored-session shape; must extend
 *     `BaseStoredSession`.
 *   - `RestoreSessionParams` — provider-specific session-restore input.
 *
 * The provider exposes both the methods AND a type guard so callers
 * can narrow a stored session loaded from localStorage to the right
 * provider's shape before passing it back in.
 */
export interface SmartAccountProvider<
  InitParams,
  InitResult,
  CreateSessionParams,
  Session extends BaseStoredSession,
  RestoreSessionParams,
> {
  /** Provider identifier — mirrors the `provider` discriminator on `Session`. */
  readonly name: string

  /** Bring the smart account online (deploy + bind SDK). */
  initialize(params: InitParams): Promise<InitResult>

  /** Mint and enable a new session for the live account. */
  createSession(
    params: CreateSessionParams,
  ): ResultAsync<{ session: Session; sessionPrivateKey: Hex }, SessionError>

  /** Validate a stored session is still usable client-side. */
  restoreSession(params: RestoreSessionParams): ResultAsync<void, SessionError>

  /**
   * Type guard to narrow a stored-session union (e.g. read from
   * `localStorage`) to this provider's shape.
   */
  isSession<T extends { provider?: string }>(session: T): session is T & Session
}
