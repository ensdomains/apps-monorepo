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
import { LEGACY_REFUND_CAPS, type RefundCaps } from './refund-caps'
import {
  buildHcaSessionConfig,
  type ChainDigest,
  type SessionEnableData,
} from './session'

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
  /**
   * The refund caps the session was authorized with, as decimal strings. They
   * are part of the salt, so a session can only be rebuilt with these exact
   * values. Absent on records written before caps were sized per session,
   * which were all signed with `LEGACY_REFUND_CAPS`.
   */
  readonly refundCaps?: {
    readonly maxRefundExchangeRate: string
    readonly maxRefundGasOverhead: string
    readonly maxRefundAmount: string
  }
}

/** Serialize caps into the stored string form. */
export function serializeRefundCaps(
  caps: RefundCaps,
): NonNullable<RhinestoneStoredSession['refundCaps']> {
  return {
    maxRefundExchangeRate: caps.maxRefundExchangeRate.toString(),
    maxRefundGasOverhead: caps.maxRefundGasOverhead.toString(),
    maxRefundAmount: caps.maxRefundAmount.toString(),
  }
}

/** The caps a stored session was authorized with. */
export function storedRefundCaps(session: RhinestoneStoredSession): RefundCaps {
  const caps = session.refundCaps
  if (!caps) return LEGACY_REFUND_CAPS
  return {
    maxRefundExchangeRate: BigInt(caps.maxRefundExchangeRate),
    maxRefundGasOverhead: BigInt(caps.maxRefundGasOverhead),
    maxRefundAmount: BigInt(caps.maxRefundAmount),
  }
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
 * the `SessionEnableData` from a persisted session — without a wallet prompt.
 *
 * The validator is stateless, so this proof goes out with EVERY session-signed
 * intent. It is reusable: the validator checks only `validUntil` and the
 * account's session nonce, which nothing increments outside revocation.
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
  const enableData: SessionEnableData = {
    userSignature: session.authorization,
    hashesAndChainIds: session.hashesAndChainIds.map((d) => ({
      chainId: BigInt(d.chainId),
      sessionDigest: d.sessionDigest,
    })),
    sessionToEnableIndex: session.sessionToEnableIndex,
    hcaSessionNonce: BigInt(session.hcaSessionNonce),
    hcaSessionConfig: buildHcaSessionConfig({
      chainId: session.chainId,
      sessionKey: session.sessionKeyAddress,
      validUntil: BigInt(session.validUntil),
      resolver: session.resolver,
      refundCaps: storedRefundCaps(session),
    }),
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
