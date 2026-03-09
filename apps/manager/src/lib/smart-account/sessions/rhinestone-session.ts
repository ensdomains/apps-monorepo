/**
 * Rhinestone Session Helpers
 *
 * Pure functions for creating and restoring Rhinestone-based sessions.
 * Designed to be used from XState actors and other non-React contexts.
 *
 * Session creation performs the full Rhinestone SDK enablement flow:
 * 1. Generate session key pair
 * 2. Define Session with sudo policy
 * 3. experimental_getSessionDetails() — get on-chain validation data
 * 4. experimental_signEnableSession() — owner signs enablement
 * 5. Store enableSignature + hashesAndChainIds for later use
 */

import type { RhinestoneAccount, Session } from '@rhinestone/sdk'
import { fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { RhinestoneStoredSession } from './types'
import { SessionError } from './zerodev-session'

export interface CreateRhinestoneSessionParams {
  readonly ownerAddress: Address
  readonly smartAccountAddress: Address
  readonly chainId: number
  readonly rhinestoneAccount: RhinestoneAccount
  readonly chain: Chain
  readonly config?: {
    readonly validUntil?: number
  }
}

/**
 * Create a new Rhinestone session with on-chain enablement.
 *
 * Performs the full SDK session enablement flow:
 * - Generates a session key pair
 * - Calls experimental_getSessionDetails + experimental_signEnableSession
 * - Stores enablement data (enableSignature, hashesAndChainIds) for sendTransaction
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
  const {
    ownerAddress,
    smartAccountAddress,
    chainId,
    rhinestoneAccount,
    chain,
    config,
  } = params

  return fromPromise(
    (async () => {
      // 1. Generate session key
      const sessionPrivateKey = generatePrivateKey()
      const sessionAccount = privateKeyToAccount(sessionPrivateKey)

      // 2. Define session with sudo policy (unrestricted — security policies to be added later)
      const sdkSession: Session = {
        owners: {
          type: 'ecdsa' as const,
          accounts: [sessionAccount],
        },
        chain,
        actions: [{ policies: [{ type: 'sudo' as const }] }],
      }

      // 3. Get session details (on-chain validation data)
      const sessionDetails =
        await rhinestoneAccount.experimental_getSessionDetails([sdkSession])

      // 4. Sign enablement (one-time owner signature)
      const enableSignature =
        await rhinestoneAccount.experimental_signEnableSession(sessionDetails)

      // 5. Serialize hashesAndChainIds for localStorage (bigint → string)
      const serializedHashes = JSON.stringify(
        sessionDetails.hashesAndChainIds.map((h) => ({
          chainId: h.chainId.toString(),
          sessionDigest: h.sessionDigest,
        })),
      )

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
        sessionConfig: JSON.stringify({ provider: 'rhinestone', chainId }),
        serializedSessionAccount: '',
        enableSignature,
        hashesAndChainIds: serializedHashes,
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
 * Validates that the session has not expired. The enableSignature and
 * hashesAndChainIds from storage are used at signer construction time
 * to build the full SessionSignerSet with enableData.
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
