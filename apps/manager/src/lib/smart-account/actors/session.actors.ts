import {
  createRhinestoneSession,
  restoreRhinestoneSession,
  SessionError,
} from '@ens-apps/rhinestone'
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
    saveSession(session)

    return okAsync({
      session,
      sessionClient: {
        sessionPrivateKey,
        enableSignature: session.enableSignature,
        hashesAndChainIds: session.hashesAndChainIds,
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

  return restoreRhinestoneSession({ session }).map(() => ({
    sessionClient: {
      sessionPrivateKey: session.sessionPrivateKey,
      enableSignature: session.enableSignature,
      hashesAndChainIds: session.hashesAndChainIds,
    },
  }))
}
