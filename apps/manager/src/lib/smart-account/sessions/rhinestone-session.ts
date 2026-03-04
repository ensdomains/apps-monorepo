/**
 * Rhinestone Session Helpers
 *
 * Pure functions for creating and restoring Rhinestone-based sessions.
 * Designed to be used from XState actors and other non-React contexts.
 */

import { fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { RhinestoneStoredSession } from './types'
import { SessionError } from './zerodev-session'

export interface CreateRhinestoneSessionParams {
  readonly ownerAddress: Address
  readonly smartAccountAddress: Address
  readonly chainId: number
  readonly config?: {
    readonly validUntil?: number
  }
}

/**
 * Create a new Rhinestone session.
 *
 * Generates a session private key and stores serializable metadata.
 * The full SDK-compatible SignerSet is constructed at signer creation time
 * (in SmartAccountContext) because Account and Chain objects are not
 * JSON-serializable.
 */
export function createRhinestoneSession(
  params: CreateRhinestoneSessionParams,
): ResultAsync<
  {
    session: RhinestoneStoredSession
    sessionPrivateKey: Hex
  },
  SessionError
> {
  const { ownerAddress, smartAccountAddress, chainId, config } = params

  return fromPromise(
    (async () => {
      const sessionPrivateKey = generatePrivateKey()
      const sessionAccount = privateKeyToAccount(sessionPrivateKey)

      const session: RhinestoneStoredSession = {
        id: crypto.randomUUID(),
        provider: 'rhinestone',
        sessionKeyAddress: sessionAccount.address,
        smartAccountAddress,
        ownerAddress,
        createdAt: Date.now(),
        chainId,
        validUntil: config?.validUntil,
        sessionPrivateKey,
        // Serializable metadata only — the SDK-compatible SignerSet is built
        // at signer construction time from the sessionPrivateKey + chain.
        sessionConfig: JSON.stringify({ provider: 'rhinestone', chainId }),
        serializedSessionAccount: '',
      }

      return { session, sessionPrivateKey }
    })(),
    (error) =>
      new SessionError(
        'Failed to create Rhinestone session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}

export interface RestoreRhinestoneSessionParams {
  readonly session: RhinestoneStoredSession
}

/**
 * Restore a Rhinestone session from stored data.
 *
 * Validates that the session has not expired. The SDK-compatible SignerSet
 * is constructed at signer creation time (SmartAccountContext) from
 * the stored sessionPrivateKey + chain, not here.
 */
export function restoreRhinestoneSession(
  params: RestoreRhinestoneSessionParams,
): ResultAsync<void, SessionError> {
  const { session } = params

  return fromPromise(
    (async () => {
      if (session.validUntil && Date.now() > session.validUntil) {
        throw new Error('Session has expired')
      }
    })(),
    (error) =>
      new SessionError(
        'Failed to restore Rhinestone session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}
