/**
 * Session actors (manager-app side).
 *
 * Thin wrappers around `@ens-apps/smart-account`'s session helpers, used by
 * the pre-registration ENABLE step. The session is created/restored HERE (in
 * the app), then attached to the `RhinestoneSigner` passed into the
 * registration machine — the machine itself never imports smart-account
 * (that would be a circular dependency).
 *
 * Flow:
 *   1. checkExistingSessionActor — reuse a valid stored session if present.
 *   2. createSessionActor — otherwise create one (the single ENABLE prompt)
 *      and persist it to localStorage.
 *   3. restoreSessionActor — validate a stored session before reuse.
 *
 * The returned `SessionClient` carries everything signer-construction needs to
 * rebuild the SDK `SessionSignerSet`. `validUntil` MUST round-trip so the
 * rebuilt action set (with its on-chain `time-frame` policy) reproduces the
 * same PermissionId.
 */

import {
  createRhinestoneSession,
  getSkippedStatus,
  getValidSessionForAccount,
  isRhinestoneSession,
  type RhinestoneStoredSession,
  restoreRhinestoneSession,
  type SessionEnableError,
  SessionRestoreError,
  type SessionScope,
  saveSession,
} from '@ens-apps/smart-account'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, Chain } from 'viem'

export type CheckSessionInput = SessionScope

export interface CheckSessionOutput {
  readonly session: RhinestoneStoredSession | null
  readonly wasSkipped: boolean
}

/**
 * Reuse a valid stored Rhinestone session for THIS HCA (owner + chain
 * verified), if any. An owner-keyed lookup alone can return a session for a
 * different account/chain whose ephemeral key is not an owner of the current
 * HCA; this scopes to the account and evicts on mismatch.
 */
export function checkExistingSessionActor(
  input: CheckSessionInput,
): ResultAsync<CheckSessionOutput, never> {
  const session = getValidSessionForAccount(input)
  const wasSkipped = getSkippedStatus(input.ownerAddress)

  if (session && !isRhinestoneSession(session)) {
    return okAsync({ session: null, wasSkipped: false })
  }
  return okAsync({ session, wasSkipped })
}

export interface CreateSessionInput {
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly chainId: number
  readonly rhinestoneAccount: RhinestoneAccount
  readonly chain: Chain
  readonly config?: { readonly validUntil?: number }
}

export interface CreateSessionOutput {
  readonly session: RhinestoneStoredSession
}

/** Create + persist a new session. Performs the single owner ENABLE signature. */
export function createSessionActor(
  input: CreateSessionInput,
): ResultAsync<CreateSessionOutput, SessionEnableError> {
  return createRhinestoneSession({
    ownerAddress: input.ownerAddress,
    smartAccountAddress: input.accountAddress,
    chainId: input.chainId,
    rhinestoneAccount: input.rhinestoneAccount,
    chain: input.chain,
    config: input.config,
  }).map(({ session }) => {
    saveSession(session)
    return { session }
  })
}

export interface RestoreSessionInput {
  readonly session: RhinestoneStoredSession
}

/** Validate a stored session for reuse (no new signature). */
export function restoreSessionActor(
  input: RestoreSessionInput,
): ResultAsync<void, SessionRestoreError> {
  const { session } = input

  if (!isRhinestoneSession(session)) {
    return errAsync(
      new SessionRestoreError({
        message: 'Session type mismatch: expected Rhinestone session',
      }),
    )
  }

  const result = restoreRhinestoneSession({ session })
  if (result.isErr()) return errAsync(result.error)
  return okAsync(result.value)
}

export interface ResolveSessionInput {
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly chain: Chain
  readonly rhinestoneAccount: RhinestoneAccount
}

export interface ResolvedSession {
  readonly session: RhinestoneStoredSession
}

/**
 * Reuse a valid stored session if present, else create one (the single ENABLE
 * signature that adds the ephemeral key as a time-boxed HCA owner).
 *
 * Encapsulates the restore-or-create branching so the React provider's
 * `enableSession` stays a thin state-setter. No on-chain "is enabled" check is
 * needed — the add-owner Intent enables it, and `restore` checks expiry.
 */
export function resolveSessionActor(
  input: ResolveSessionInput,
): ResultAsync<ResolvedSession, SessionEnableError> {
  const { ownerAddress, accountAddress, chain } = input

  // Scope reuse to THIS HCA (owner + chain verified): an owner-keyed lookup
  // can return a session for a different account/chain whose ephemeral key is
  // not an owner of the current HCA, which would skip ENABLE and then fail
  // intent simulation. On mismatch the stale row is evicted and we create
  // fresh.
  const stored = getValidSessionForAccount({
    accountAddress,
    ownerAddress,
    chainId: chain.id,
  })
  if (!stored || !isRhinestoneSession(stored)) {
    return createAndResolve(input)
  }

  // Valid stored session: validate (expiry) and reuse; on failure create fresh.
  return restoreSessionActor({ session: stored })
    .map((): ResolvedSession => ({ session: stored }))
    .orElse(() => createAndResolve(input))
}

function createAndResolve(
  input: ResolveSessionInput,
): ResultAsync<ResolvedSession, SessionEnableError> {
  return createSessionActor({
    ownerAddress: input.ownerAddress,
    accountAddress: input.accountAddress,
    chainId: input.chain.id,
    rhinestoneAccount: input.rhinestoneAccount,
    chain: input.chain,
  }).map(({ session }) => ({ session }))
}
