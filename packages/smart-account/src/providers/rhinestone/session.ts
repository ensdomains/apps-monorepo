/**
 * Rhinestone Session Helpers
 *
 * Pure functions for creating and restoring Rhinestone-based sessions.
 * Designed to be used from XState actors and other non-React contexts.
 *
 * Session creation performs the Rhinestone SDK enablement flow:
 * 1. Generate session key pair
 * 2. Define Session with registration-scoped actions (each carrying a
 *    `time-frame` policy for on-chain expiry enforcement)
 * 3. experimental_getSessionDetails() — get on-chain validation data
 * 4. experimental_signEnableSession() — owner signs MultiChainSession (one wallet prompt, done)
 * 5. Store enableSignature + hashesAndChainIds for later use
 *
 * The session is NOT installed on-chain here. It is enabled lazily as part of
 * the first real transaction, via enableData in the experimental_session signers.
 *
 * @see https://docs.rhinestone.dev — multi-chain session "enable mode"
 */

import type { RhinestoneAccount, Session } from '@rhinestone/sdk'
import { fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { SessionError } from '../../errors'
import {
  buildRegistrationSessionActions,
  REGISTRATION_SESSION_VALIDITY_SECONDS,
} from './registration-policy'
import type { RhinestoneStoredSession } from './types'

export interface CreateRhinestoneSessionParams {
  readonly ownerAddress: Address
  readonly smartAccountAddress: Address
  readonly chainId: number
  readonly rhinestoneAccount: RhinestoneAccount
  readonly chain: Chain
  readonly config?: {
    /**
     * Optional start timestamp (unix seconds).
     * Defaults to `Math.floor(Date.now() / 1000)`.
     * Used as `validAfter` in the per-action `time-frame` policy.
     */
    readonly validAfter?: number
    /**
     * Optional expiry timestamp (unix seconds).
     * Defaults to `validAfter + REGISTRATION_SESSION_VALIDITY_SECONDS` (30 days).
     */
    readonly validUntil?: number
  }
}

/**
 * Create a new Rhinestone session with on-chain enablement.
 *
 * Performs the SDK session enablement flow:
 * - Generates a session key pair
 * - Calls experimental_getSessionDetails + experimental_signEnableSession (one wallet prompt)
 * - Stores enablement data (enableSignature, hashesAndChainIds) for future session-signed txs
 * - Session is enabled on-chain lazily via enableData in the first real transaction's signers
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

      // 2. Compute start + expiry (unix seconds). Persisted on the stored
      //    session so signer-reconstruction produces the same PermissionId.
      //    Both feed into the per-action `time-frame` policy (on-chain) AND
      //    the client-side staleness check in `restoreRhinestoneSession`.
      const validAfter = config?.validAfter ?? Math.floor(Date.now() / 1000)
      const validUntil =
        config?.validUntil ?? validAfter + REGISTRATION_SESSION_VALIDITY_SECONDS

      // 3. Define session scoped to the registration / renewal flows.
      //    See ./registration-policy.ts for the action set + threat
      //    model. The same actions array MUST be reproduced byte-for-byte at
      //    signer-construction time (SmartAccountContext.tsx) — the
      //    PermissionId is derived from this config; mismatch yields
      //    `InvalidSignature()` at runtime.
      const sdkSession: Session = {
        owners: {
          type: 'ecdsa' as const,
          accounts: [sessionAccount],
        },
        chain,
        actions: buildRegistrationSessionActions({
          smartAccountAddress,
          eoaAddress: ownerAddress,
          validAfter,
          validUntil,
        }),
      }

      // 4. Get session details (on-chain validation data)
      const sessionDetails =
        await rhinestoneAccount.experimental_getSessionDetails([sdkSession])

      // NOTE: previously we ran normalizeSessionDetailsForEip712Signing here
      // to coerce expires/nonce/chainId values for older SDKs. With
      // @rhinestone/sdk@1.5.1 the SDK returns canonical values and any
      // rewrite makes the owner-signed EIP-712 digest disagree with what
      // the on-chain smart-session validator reconstructs, producing
      // `InvalidSignature()` reverts at orchestrator simulation time.
      // Leaving the payload as the SDK returns it.

      // 5. Sign enablement (owner EIP-712 — MultiChainSession)
      const enableSignature =
        await rhinestoneAccount.experimental_signEnableSession(sessionDetails)

      // 6. Serialize hashesAndChainIds for localStorage (bigint → string)
      // Session is enabled lazily as part of the first real transaction via enableData in signers.
      const serializedHashes = JSON.stringify(
        sessionDetails.hashesAndChainIds.map(
          (h: { chainId: bigint; sessionDigest: Hex }) => ({
            chainId: h.chainId.toString(),
            sessionDigest: h.sessionDigest,
          }),
        ),
      )

      const session: RhinestoneStoredSession = {
        id: crypto.randomUUID(),
        provider: 'rhinestone',
        sessionKeyAddress: sessionAccount.address,
        smartAccountAddress,
        ownerAddress,
        createdAt: Date.now(),
        chainId,
        validAfter,
        validUntil,
        sessionPrivateKey,
        sessionConfig: JSON.stringify({ provider: 'rhinestone', chainId }),
        enableSignature,
        hashesAndChainIds: serializedHashes,
      }

      return { session, sessionPrivateKey }
    })(),
    (error: unknown) =>
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
 * Refuses to restore once `session.validUntil` has passed. This is a UX
 * preflight — on-chain enforcement is handled by the `time-frame` policy
 * baked into every action at session-creation time.
 *
 * The `enableSignature` and `hashesAndChainIds` from storage are used at
 * signer construction time to build the full SessionSignerSet with
 * enableData.
 */
export function restoreRhinestoneSession(
  params: RestoreRhinestoneSessionParams,
): ResultAsync<void, SessionError> {
  const { session } = params

  return fromPromise(
    (async () => {
      if (session.validUntil && Date.now() > session.validUntil * 1000) {
        throw new Error('Session has expired')
      }
    })(),
    (error: unknown) =>
      new SessionError(
        'Failed to restore Rhinestone session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}
