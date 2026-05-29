import {
  createRhinestoneSession,
  restoreRhinestoneSession,
  SessionError,
} from '@ens-apps/smart-account'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hex } from 'viem'
import {
  getSkippedStatus,
  getValidSessionByOwner,
  saveSession,
} from '../sessions/session-storage'
import {
  isRhinestoneSession,
  type SessionConfig,
  type StoredSession,
} from '../sessions/types'

/**
 * Session client returned by session actors.
 *
 * Rhinestone-only: session private key + enablement data. The full
 * SDK-compatible SignerSet is constructed at signer creation time in
 * SmartAccountContext.
 */
export type SessionClient = {
  readonly sessionPrivateKey: Hex
  readonly enableSignature: Hex
  readonly hashesAndChainIds: string
  /**
   * EOA the session was signed against. Carried explicitly (rather
   * than re-read from React context) so the action-set rebuild at
   * `SmartAccountContext` reproduces the exact bytes the enable
   * signature was computed over. Pulling from React context risks
   * picking up a different casing / different wallet across reloads.
   */
  readonly ownerAddress: Address
  /**
   * Session expiry (unix seconds). Required for signer construction —
   * the `time-frame` policy baked into the actions array is derived from
   * this value, and the rebuild in SmartAccountContext must reproduce the
   * exact same actions to match the PermissionId.
   */
  readonly validUntil: number
}

export interface CheckSessionInput {
  readonly ownerAddress: Address
}

export interface CheckSessionOutput {
  readonly session: StoredSession | null
  readonly wasSkipped: boolean
}

export function checkExistingSessionActor(
  input: CheckSessionInput,
): ResultAsync<CheckSessionOutput, SessionError> {
  const session = getValidSessionByOwner(input.ownerAddress)
  const wasSkipped = getSkippedStatus(input.ownerAddress)

  // Only Rhinestone sessions are supported. Anything else is discarded.
  if (session && !isRhinestoneSession(session)) {
    return okAsync({ session: null, wasSkipped: false })
  }

  return okAsync({ session, wasSkipped })
}

export interface CreateSessionInput {
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly chainId: number
  readonly config?: SessionConfig
  /** Rhinestone account, needed for on-chain session enablement */
  readonly rhinestoneAccount: RhinestoneAccount
  readonly chain: Chain
}

export interface CreateSessionOutput {
  readonly session: StoredSession
  readonly sessionClient: SessionClient
}

export function createSessionActor(
  input: CreateSessionInput,
): ResultAsync<CreateSessionOutput, SessionError> {
  return createRhinestoneSession({
    ownerAddress: input.ownerAddress,
    smartAccountAddress: input.accountAddress,
    chainId: input.chainId,
    rhinestoneAccount: input.rhinestoneAccount,
    chain: input.chain,
    config: input.config,
  }).andThen(({ session, sessionPrivateKey }) => {
    // `validUntil` is always populated by `createRhinestoneSession`
    // (default 30 days, or `config.validUntil` if provided). Guard
    // anyway so a future regression surfaces here rather than as an
    // `InvalidSignature()` revert at signer-construction time.
    if (typeof session.validUntil !== 'number') {
      return errAsync(
        new SessionError(
          'Failed to create session',
          'Created Rhinestone session is missing validUntil',
        ),
      )
    }

    saveSession(session)

    return okAsync({
      session,
      sessionClient: {
        sessionPrivateKey,
        enableSignature: session.enableSignature,
        hashesAndChainIds: session.hashesAndChainIds,
        ownerAddress: session.ownerAddress,
        validUntil: session.validUntil,
      },
    })
  })
}

export interface RestoreSessionInput {
  readonly session: StoredSession
}

export interface RestoreSessionOutput {
  readonly sessionClient: SessionClient
}

export function restoreSessionActor(
  input: RestoreSessionInput,
): ResultAsync<RestoreSessionOutput, SessionError> {
  const { session } = input

  if (!isRhinestoneSession(session)) {
    return errAsync(
      new SessionError(
        'Failed to restore session',
        'Session type mismatch: expected Rhinestone session',
      ),
    )
  }

  // The on-chain `time-frame` policy is keyed off `validUntil` and is
  // part of the PermissionId. A session persisted under an older code
  // path (no time-frame policy) cannot be replayed correctly — refuse
  // to restore it; the dApp will prompt for a fresh enable.
  if (typeof session.validUntil !== 'number') {
    return errAsync(
      new SessionError(
        'Failed to restore session',
        'Stored Rhinestone session is missing validUntil',
      ),
    )
  }

  const restoredValidUntil = session.validUntil

  return restoreRhinestoneSession({ session }).map(() => ({
    sessionClient: {
      sessionPrivateKey: session.sessionPrivateKey,
      enableSignature: session.enableSignature,
      hashesAndChainIds: session.hashesAndChainIds,
      ownerAddress: session.ownerAddress,
      validUntil: restoredValidUntil,
    },
  }))
}
