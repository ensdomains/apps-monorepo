/**
 * Rhinestone standalone-HCA session types.
 *
 * The shared/cross-provider `BaseStoredSession` lives at the package root in
 * `../../types.ts`. This file adds the standalone-HCA-specific persisted shape:
 * a scoped SmartSession (permission ID + enable-data + multi-chain
 * authorization), NOT the old ephemeral-owner record.
 */

import type { Address, Hex } from 'viem'
import type { BaseStoredSession } from '../../types'
import {
  getDestinationContracts,
  MAX_REFUND_AMOUNT,
  MAX_REFUND_EXCHANGE_RATE,
  MAX_REFUND_GAS_OVERHEAD,
} from './manifest'
import type { ChainDigest, SessionEnableData } from './session'

/**
 * Persisted standalone-HCA session. Captures everything needed to resume a
 * registration across the commit cooldown and to re-derive the Rhinestone
 * signer without another wallet prompt (per the doc's "State and recovery"
 * list).
 */
export interface RhinestoneStoredSession extends BaseStoredSession {
  readonly provider: 'rhinestone'
  /** Scoped-session permission ID for the destination HCA. */
  readonly permissionId: Hex
  /** Resolver (PermissionedResolver proxy) this session is bound to. */
  readonly resolver: Address
  /** HCA session nonce captured at authorization time. */
  readonly hcaSessionNonce: string
  /** The one multi-chain authorization signature (destination-only for now). */
  readonly authorization: Hex
  /** Per-chain session digests from `SessionDetails.hashesAndChainIds`. */
  readonly hashesAndChainIds: readonly {
    readonly chainId: string
    readonly sessionDigest: Hex
  }[]
  /** Destination session's index into the signed session set. */
  readonly sessionToEnableIndex: number
}

/** Serialize `ChainDigest[]` (bigint chainId) into the stored string form. */
export function serializeChainDigests(
  digests: readonly ChainDigest[],
): RhinestoneStoredSession['hashesAndChainIds'] {
  return digests.map((d) => ({
    chainId: d.chainId.toString(),
    sessionDigest: d.sessionDigest,
  }))
}

/** Deserialize stored digests back into `ChainDigest[]` (bigint chainId). */
export function deserializeChainDigests(
  digests: RhinestoneStoredSession['hashesAndChainIds'],
): ChainDigest[] {
  return digests.map((d) => ({
    chainId: BigInt(d.chainId),
    sessionDigest: d.sessionDigest,
  }))
}

/**
 * The session-enable payload passed to the registration machine's
 * `START_REGISTRATION` (the machine's `HcaSessionEnableParams`). Reconstructs
 * the `SessionEnableData` (including `hcaSessionConfig`, so the SDK's signer
 * can rebuild the fixed-session enable proof from the signature alone) from a
 * persisted session — without a wallet prompt.
 *
 * Safe to rebuild and present on EVERY use, not just the session's first: the
 * proof is stateless and re-validated fresh each time (the redeployed
 * `HCAOwnerAndSessionValidator` checks only `validUntil` and the account's
 * session nonce, which nothing increments outside revocation) — there is no
 * separate on-chain enable step to be idempotent about. Callers attach it
 * whenever the batch also carries the EIP-2612 funding pair, which the
 * validator's policy only accepts on the code path this proof unlocks.
 */
export interface HcaSessionEnablePayload {
  readonly enableData: SessionEnableData
  readonly permissionId: Hex
  readonly sessionKey: Address
  readonly validUntil: bigint
}

export function buildHcaSessionEnablePayload(
  session: RhinestoneStoredSession,
): HcaSessionEnablePayload {
  const c = getDestinationContracts(session.chainId)
  const enableData: SessionEnableData = {
    userSignature: session.authorization,
    hashesAndChainIds: session.hashesAndChainIds.map((d) => ({
      chainId: BigInt(d.chainId),
      sessionDigest: d.sessionDigest,
    })),
    sessionToEnableIndex: session.sessionToEnableIndex,
    hcaSessionNonce: BigInt(session.hcaSessionNonce),
    hcaSessionConfig: {
      sessionKey: session.sessionKeyAddress,
      validUntil: Number(session.validUntil),
      resolver: session.resolver,
      refundToken: c.usdc,
      maxRefundExchangeRate: MAX_REFUND_EXCHANGE_RATE,
      maxRefundGasOverhead: Number(MAX_REFUND_GAS_OVERHEAD),
      maxRefundAmount: MAX_REFUND_AMOUNT,
    },
  }
  return {
    enableData,
    permissionId: session.permissionId,
    sessionKey: session.sessionKeyAddress,
    validUntil: BigInt(session.validUntil),
  }
}

/**
 * Type guard for Rhinestone sessions. Generic over the host app's broader
 * stored-session union so consumers don't depend on a specific union shape.
 */
export function isRhinestoneSession<T extends { provider?: string }>(
  session: T,
): session is T & RhinestoneStoredSession {
  return session.provider === 'rhinestone'
}
