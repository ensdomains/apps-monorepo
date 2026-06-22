/**
 * Rhinestone HCA session helpers (owner-key model).
 *
 * A "session" here is an EPHEMERAL KEY added as a time-boxed OWNER of the HCA
 * (see ./registration-policy.ts for the model + security notes). Creating a
 * session:
 *   1. Generates an ephemeral key pair (persisted to localStorage by the
 *      caller via session-storage).
 *   2. Submits ONE owner-signed, sponsored Intent that calls the HCA
 *      validator's `updateConfig` to add the ephemeral key as a co-owner with
 *      a finite expiration. THIS IS THE SINGLE "ENABLE" WALLET SIGNATURE.
 *
 * Thereafter the ephemeral key signs registration Intents prompt-free as a
 * valid owner (the caller passes it via `signers: { type: 'owner', kind:
 * 'ecdsa', accounts: [ephemeralAccount] }`).
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { err, fromPromise, ok, type Result, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { SessionEnableError, SessionRestoreError } from '../../errors'
import {
  buildAddSessionOwnerCall,
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
    /** Optional expiry (unix seconds). Default: now + 1 week. */
    readonly validUntil?: number
  }
}

/**
 * Create a session: add the ephemeral key as a time-boxed HCA owner via one
 * owner-signed sponsored Intent, and return the stored-session record.
 */
export function createRhinestoneSession(
  params: CreateRhinestoneSessionParams,
): ResultAsync<
  { session: RhinestoneStoredSession; sessionPrivateKey: Hex },
  SessionEnableError
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
      const sessionPrivateKey = generatePrivateKey()
      const sessionAccount = privateKeyToAccount(sessionPrivateKey)

      const validUntil =
        config?.validUntil ??
        Math.floor(Date.now() / 1000) + REGISTRATION_SESSION_VALIDITY_SECONDS

      // ENABLE: owner-signed, sponsored Intent that adds the ephemeral key as a
      // time-boxed co-owner of the HCA. This is the single wallet prompt.
      const addOwnerCall = buildAddSessionOwnerCall({
        sessionKeyAddress: sessionAccount.address,
        validUntil,
      })
      const tx = await rhinestoneAccount.sendTransaction({
        chain,
        sponsored: true,
        calls: [addOwnerCall],
        tokenRequests: [],
      })
      await rhinestoneAccount.waitForExecution(tx, false)

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
      }

      return { session, sessionPrivateKey }
    })(),
    (error: unknown) =>
      new SessionEnableError({
        message: 'Failed to enable Rhinestone session (add owner)',
        cause: error,
      }),
  )
}

export interface RestoreRhinestoneSessionParams {
  readonly session: RhinestoneStoredSession
}

/**
 * Validate a stored session for reuse. Refuses once `validUntil` has passed —
 * a UX preflight backed by the on-chain owner expiration (the ephemeral owner
 * stops being a valid signer after expiry).
 */
export function restoreRhinestoneSession(
  params: RestoreRhinestoneSessionParams,
): Result<void, SessionRestoreError> {
  const { session } = params

  if (session.validUntil && Date.now() > session.validUntil * 1000) {
    return err(
      new SessionRestoreError({
        message: 'Session has expired',
        cause: new Error('Session has expired'),
      }),
    )
  }

  return ok(undefined)
}
