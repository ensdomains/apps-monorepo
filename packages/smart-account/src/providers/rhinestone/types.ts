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
  /** The one multi-chain authorization signature (destination + source). */
  readonly authorization: Hex
  /** Per-chain session digests from `SessionDetails.hashesAndChainIds`. */
  readonly hashesAndChainIds: readonly {
    readonly chainId: string
    readonly sessionDigest: Hex
  }[]
  /** Destination session's index into the signed session set. */
  readonly sessionToEnableIndex: number
  /**
   * Cross-chain funding session. Present only when the user pays from a source
   * chain (e.g. Base Sepolia). The destination session above handles the HCA
   * on Sepolia; this one authorizes the `hcaFundingSessionValidator` on the
   * source chain to pull USDC via `sourceCalls`.
   */
  readonly sourceChainId?: number
  readonly sourcePermissionId?: Hex
  /**
   * The funding Nexus on the source chain. The source session is bound to it,
   * cross-chain intents are SENT from it, and the EIP-2612 permit names it as
   * spender — so without this a stored cross-chain session cannot be resumed.
   */
  readonly sourceNexusAddress?: Address
  readonly sourceSessionKeyAddress?: Address
  readonly sourceAuthorization?: Hex
  readonly sourceHashesAndChainIds?: readonly {
    readonly chainId: string
    readonly sessionDigest: Hex
  }[]
  readonly sourceSessionToEnableIndex?: number
  /** Max USDC (6dp) the source session may pull from the wallet. */
  readonly maxSourceAmount?: string
  /** Max USDC (6dp) the destination session may spend. */
  readonly maxDestinationAmount?: string
  /**
   * Set when the source (L2 funding) half was ATTEMPTED and failed, leaving a
   * destination-only session.
   *
   * Distinguishes "never tried" from "tried and could not". Without it the two
   * are indistinguishable, and the only two available behaviours are both
   * wrong: re-authorize on sight (a wallet prompt on every gate check that
   * never converges, since the retry degrades to the same state) or never
   * re-authorize (a user who hit one transient source-chain failure is stuck
   * without the L2 route until the session expires).
   */
  readonly sourceAuthorizationFailed?: boolean
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
 * the `SessionEnableData` + the `enableSessionWithRefund` call args from a
 * persisted session — without a wallet prompt.
 *
 * Safe to rebuild and present on EVERY use, not just the session's first: the
 * proof is reusable (`_validateSessionEnableProof` checks only `validUntil` and
 * the account's session nonce, which nothing increments outside revocation) and
 * `enableSessionWithRefund` is idempotent. Callers attach it whenever the batch
 * also carries the EIP-2612 funding pair, which the validator's policy only
 * accepts on the code path this proof unlocks.
 *
 * When cross-chain, the optional `source` carries the source session's enable
 * info for the `PerChainSessionSignerSet` on the funding chain.
 */
export interface HcaSessionEnablePayload {
  readonly enableData: SessionEnableData
  readonly permissionId: Hex
  readonly sessionKey: Address
  readonly validUntil: bigint
  readonly source?: {
    readonly enableData: SessionEnableData
    readonly permissionId: Hex
    readonly sessionKey: Address
    readonly validUntil: bigint
    readonly nexusAddress: Address
    readonly chainId: number
  }
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
  }
  const source = buildSourcePayload(session)
  return {
    enableData,
    permissionId: session.permissionId,
    sessionKey: session.sessionKeyAddress,
    validUntil: BigInt(session.validUntil),
    ...(source ? { source } : {}),
  }
}

/**
 * The source half of the payload, or `undefined` for a same-chain session.
 *
 * Every field is required: a half-populated cross-chain record cannot produce a
 * valid source proof, so it is treated as same-chain rather than silently
 * falling back to the destination session's values (which used to hand the
 * source validator the destination's index and HCA nonce).
 */
function buildSourcePayload(
  session: RhinestoneStoredSession,
): NonNullable<HcaSessionEnablePayload['source']> | undefined {
  const {
    sourceChainId,
    sourcePermissionId,
    sourceNexusAddress,
    sourceSessionKeyAddress,
    sourceHashesAndChainIds,
    sourceSessionToEnableIndex,
  } = session
  if (
    sourceChainId === undefined ||
    !sourcePermissionId ||
    !sourceNexusAddress ||
    !sourceSessionKeyAddress ||
    !sourceHashesAndChainIds ||
    sourceSessionToEnableIndex === undefined
  ) {
    return undefined
  }
  return {
    // No `hcaSessionNonce` — that counter belongs to the destination HCA's
    // enable proof; the source validator has none.
    enableData: {
      userSignature: session.sourceAuthorization ?? session.authorization,
      hashesAndChainIds: sourceHashesAndChainIds.map((d) => ({
        chainId: BigInt(d.chainId),
        sessionDigest: d.sessionDigest,
      })),
      sessionToEnableIndex: sourceSessionToEnableIndex,
    },
    permissionId: sourcePermissionId,
    sessionKey: sourceSessionKeyAddress,
    validUntil: BigInt(session.validUntil),
    nexusAddress: sourceNexusAddress,
    chainId: sourceChainId,
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
