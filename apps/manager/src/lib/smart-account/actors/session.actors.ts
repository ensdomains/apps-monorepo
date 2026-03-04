import type { KernelAccountClient, KernelValidator } from '@zerodev/sdk'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
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

export type SessionClient =
  | KernelAccountClient
  | {
      readonly sessionConfig: Record<string, unknown>
      readonly sessionPrivateKey: Hex
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
}

export interface CreateSessionOutput {
  readonly session: StoredSession
  readonly sessionClient: SessionClient
}

export function createSessionActor(
  input: CreateSessionInput,
): ResultAsync<CreateSessionOutput, SessionError> {
  if (input.provider === 'rhinestone') {
    return createRhinestoneSession({
      ownerAddress: input.ownerAddress,
      smartAccountAddress: input.accountAddress,
      chainId: input.chainId,
      config: input.config,
    }).andThen(({ session, sessionPrivateKey }) => {
      saveSession(session)

      return okAsync({
        session,
        sessionClient: {
          sessionPrivateKey,
          sessionConfig: fromThrowable(
            () => JSON.parse(session.sessionConfig) as Record<string, unknown>,
            () => new SessionError('Failed to create session', 'Invalid session config format')
          )(),
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
    return restoreRhinestoneSession({ session }).map(({ sessionConfig }) => ({
      sessionClient: {
        sessionConfig,
        sessionPrivateKey: session.sessionPrivateKey,
      },
    }))
  }

  return restoreZeroDevSession({ session }).map((client) => ({
    sessionClient: client,
  }))
}
