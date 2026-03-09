import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { KernelAccountClient, KernelValidator } from '@zerodev/sdk'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hex } from 'viem'
import type { SessionProvider } from '@/utils/feature-flags'
import {
  createRhinestoneSession,
  createZeroDevSession,
  restoreRhinestoneSession,
  restoreZeroDevSession,
} from '../sessions'
import {
  getSkippedStatus,
  getValidSessionByOwner,
  saveSession,
} from '../sessions/session-storage'
import type { SessionConfig, StoredSession } from '../sessions/types'
import { isRhinestoneSession, isZeroDevSession } from '../sessions/types'
import { SessionError } from '../sessions/zerodev-session'

/**
 * Session client returned by session actors.
 * - ZeroDev: a KernelAccountClient (session-derived)
 * - Rhinestone: session private key + enablement data — the full SDK-compatible
 *   SignerSet is constructed at signer creation time (SmartAccountContext).
 */
export type SessionClient =
  | KernelAccountClient
  | {
      readonly sessionPrivateKey: Hex
      readonly enableSignature: Hex
      readonly hashesAndChainIds: string
    }

export interface CheckSessionInput {
  readonly ownerAddress: Address
  readonly provider: SessionProvider
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

  if (session) {
    const sessionProvider = session.provider ?? 'zerodev'
    if (sessionProvider !== input.provider) {
      return okAsync({ session: null, wasSkipped: false })
    }
  }

  return okAsync({ session, wasSkipped })
}

export interface CreateSessionInput {
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly provider: SessionProvider
  readonly chainId: number
  readonly ecdsaValidator?: KernelValidator<'ECDSAValidator'>
  readonly config?: SessionConfig
  /** Rhinestone-specific: needed for on-chain session enablement */
  readonly rhinestoneAccount?: RhinestoneAccount
  readonly chain?: Chain
}

export interface CreateSessionOutput {
  readonly session: StoredSession
  readonly sessionClient: SessionClient
}

export function createSessionActor(
  input: CreateSessionInput,
): ResultAsync<CreateSessionOutput, SessionError> {
  if (input.provider === 'rhinestone') {
    if (!input.rhinestoneAccount || !input.chain) {
      return errAsync(
        new SessionError(
          'Failed to create session',
          'Missing rhinestoneAccount or chain for Rhinestone session enablement',
        ),
      )
    }

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

  if (!input.ecdsaValidator) {
    return errAsync(
      new SessionError(
        'Failed to create session',
        'Missing ECDSA validator for ZeroDev provider',
      ),
    )
  }

  return createZeroDevSession({
    ownerAddress: input.ownerAddress,
    smartAccountAddress: input.accountAddress,
    ecdsaValidator: input.ecdsaValidator,
    config: input.config,
  }).andThen(({ session, client }) => {
    saveSession(session)
    return okAsync({ session, sessionClient: client })
  })
}

export interface RestoreSessionInput {
  readonly session: StoredSession
  readonly provider: SessionProvider
}

export interface RestoreSessionOutput {
  readonly sessionClient: SessionClient
}

export function restoreSessionActor(
  input: RestoreSessionInput,
): ResultAsync<RestoreSessionOutput, SessionError> {
  const { session, provider } = input

  if (provider === 'rhinestone' && !isRhinestoneSession(session)) {
    return errAsync(
      new SessionError(
        'Failed to restore session',
        'Session type mismatch: expected Rhinestone session',
      ),
    )
  }

  if (provider === 'zerodev' && !isZeroDevSession(session)) {
    return errAsync(
      new SessionError(
        'Failed to restore session',
        'Session type mismatch: expected ZeroDev session',
      ),
    )
  }

  if (isRhinestoneSession(session)) {
    return restoreRhinestoneSession({ session }).map(() => ({
      sessionClient: {
        sessionPrivateKey: session.sessionPrivateKey,
        enableSignature: session.enableSignature,
        hashesAndChainIds: session.hashesAndChainIds,
      },
    }))
  }

  return restoreZeroDevSession({ session }).map((client) => ({
    sessionClient: client,
  }))
}
