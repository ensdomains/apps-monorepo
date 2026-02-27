/**
 * Rhinestone Session Helpers
 *
 * Pure functions for creating and restoring Rhinestone-based sessions.
 * Designed to be used from XState actors and other non-React contexts.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { RhinestoneStoredSession } from './types'
import { SessionError } from './zerodev-session'

export interface CreateRhinestoneSessionParams {
  rhinestoneAccount: RhinestoneAccount
  ownerAddress: Address
  smartAccountAddress: Address
  chainId: number
  config?: {
    validUntil?: number
  }
}

/**
 * Create a new Rhinestone session.
 *
 * Uses the experimental_session signer type from the Rhinestone SDK and
 * returns both the stored session metadata and the session private key.
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

      const sessionConfig = {
        signers: {
          type: 'experimental_session' as const,
          data: {
            privateKey: sessionPrivateKey,
          },
        },
      }

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
        sessionConfig: JSON.stringify(sessionConfig),
        // Transitional compatibility field for existing call sites that still
        // expect a serializedSessionAccount string.
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
  session: RhinestoneStoredSession
  rhinestoneAccount: RhinestoneAccount
}

/**
 * Restore a Rhinestone session from stored data.
 *
 * Currently returns the parsed session config object after validating that
 * the session has not expired. The Rhinestone account wiring is handled
 * by the caller using the returned config.
 */
export function restoreRhinestoneSession(
  params: RestoreRhinestoneSessionParams,
): ResultAsync<{ sessionConfig: object }, SessionError> {
  const { session } = params

  return fromPromise(
    (async () => {
      if (session.validUntil && Date.now() > session.validUntil) {
        throw new Error('Session has expired')
      }

      const sessionConfig = JSON.parse(session.sessionConfig)
      return { sessionConfig }
    })(),
    (error) =>
      new SessionError(
        'Failed to restore Rhinestone session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}
