/**
 * Rhinestone Session Helpers
 *
 * Pure functions for creating and restoring Rhinestone-based sessions.
 * Designed to be used from XState actors and other non-React contexts.
 *
 * Session creation performs the Rhinestone SDK enablement flow:
 * 1. Generate session key pair
 * 2. Define Session with sudo policy
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
  buildRegistrationSessionActionsHash,
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
     * Optional expiry timestamp (unix seconds).
     * Defaults to `now + REGISTRATION_SESSION_VALIDITY_SECONDS` (30 days).
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

      // 2. Compute expiry up-front (unix seconds). Persisted on the stored
      //    session and consulted client-side by `restoreRhinestoneSession`
      //    and `isSessionExpired`. Currently NOT baked into the action set
      //    (the on-chain `time-frame` policy is disabled — see
      //    ./registration-policy.ts for the SDK ↔ deployed contract
      //    initData mismatch). Once upstream is fixed, this value will
      //    round-trip into `buildRegistrationSessionActions` so the rebuild
      //    in SmartAccountContext produces the same PermissionId.
      const validUntil =
        config?.validUntil ??
        Math.floor(Date.now() / 1000) + REGISTRATION_SESSION_VALIDITY_SECONDS

      // 3. Define session scoped to the registration / renewal flows.
      //    See ./registration-policy.ts for the action set + threat
      //    model. The same actions array MUST be reproduced
      //    byte-for-byte at signer-construction time
      //    (SmartAccountContext.tsx) — the PermissionId is derived
      //    from this config; mismatch yields `InvalidSignature()` at
      //    runtime. We persist a hash over the action set on the
      //    stored session so `restoreRhinestoneSession` can detect
      //    drift at load time and force a fresh enable rather than
      //    failing opaquely inside a tx.
      const actionsParams = {
        eoaAddress: ownerAddress,
        validUntil,
      }
      const actions = buildRegistrationSessionActions(actionsParams)
      const actionsHash = buildRegistrationSessionActionsHash(actionsParams)
      const sdkSession: Session = {
        owners: {
          type: 'ecdsa' as const,
          accounts: [sessionAccount],
        },
        chain,
        actions,
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
        validUntil,
        sessionPrivateKey,
        sessionConfig: JSON.stringify({ provider: 'rhinestone', chainId }),
        enableSignature,
        hashesAndChainIds: serializedHashes,
        actionsHash,
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
 * Two refuse conditions:
 *
 *   1. Expiry — refuses once `session.validUntil` has passed. This is
 *      currently the **only** expiry check; see `registration-policy.ts`
 *      for why the matching on-chain `time-frame` policy is disabled. A
 *      stolen session key submitted from an attacker's bundler is not
 *      bound by this check.
 *   2. Action-set drift — refuses if the action set produced by the
 *      current `buildRegistrationSessionActions(params)` no longer
 *      hashes to `session.actionsHash`. Any drift (added rule, swapped
 *      constant, renamed selector) invalidates the PermissionId baked
 *      into `enableSignature`, so reusing the session would fail with
 *      `InvalidSignature()` at orchestrator simulation time. Refusing
 *      up-front forces a single fresh wallet prompt instead.
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
      const currentHash = buildRegistrationSessionActionsHash({
        eoaAddress: session.ownerAddress,
        validUntil:
          session.validUntil ??
          Math.floor(session.createdAt / 1000) +
            REGISTRATION_SESSION_VALIDITY_SECONDS,
      })
      if (currentHash !== session.actionsHash) {
        throw new Error(
          'Stored session was enabled against a different action set; please re-enable',
        )
      }
    })(),
    (error: unknown) =>
      new SessionError(
        'Failed to restore Rhinestone session',
        error instanceof Error ? error.message : String(error),
      ),
  )
}
