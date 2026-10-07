/**
 * Per-session gas-refund caps.
 *
 * A session authorization fixes three refund ceilings (hashed into its salt,
 * so they are part of what the owner signs), and the validator rejects any
 * intent whose quoted refund exceeds one of them with `GasRefundNotAllowed()`.
 * The orchestrator quotes the refund per intent, from its own market data:
 *
 *     gasOverhead  = base + relayFeeUsd ÷ ethUsd ÷ gasPrice
 *     refundAmount ≈ 1.8 × (1.5M + gasOverhead) × gasPrice × ethUsd
 *     exchangeRate = ethUsd in USDC base units
 *
 * (measured against live quotes; Rhinestone changes `base` without notice, so
 * nothing here hardcodes the formula). `refundAmount` and `exchangeRate` grow
 * with prices, and their fixed caps are the dollar bound on a session. The
 * overhead does the opposite: it carries a fixed dollar fee in GAS UNITS, so a
 * cheap-gas regime inflates it — Sepolia going from ~1 gwei to ~1 Mwei moved it
 * from ~52k to ~3M and failed every intent against a fixed 500k cap.
 *
 * So the overhead cap is sized per session from a live quote with headroom,
 * and every session-signed intent is checked against its session's caps before
 * signing. A quote past the overhead cap is fixed by authorizing a new session
 * sized from that quote; a quote past the other caps is refused.
 */

import type { RhinestoneAccount, Transaction } from '@rhinestone/sdk'
import { type Address, type Chain, isAddressEqual, zeroAddress } from 'viem'
import { HCA_LEG_GAS_LIMITS, HCA_MAX_LEG_FEES_USDC } from './budget'
import {
  getDestinationContracts,
  MAX_REFUND_AMOUNT,
  MAX_REFUND_EXCHANGE_RATE,
  MAX_REFUND_GAS_OVERHEAD,
} from './manifest'
import { buildCommitCall } from './registration-calls'

/** The three refund ceilings a session authorization fixes. */
export interface RefundCaps {
  /** USDC base units per ETH (uint96). */
  readonly maxRefundExchangeRate: bigint
  /** Gas units the executor may add to measured gas (uint48). */
  readonly maxRefundGasOverhead: bigint
  /** USDC base units the executor may pull per intent (uint96). */
  readonly maxRefundAmount: bigint
}

/**
 * The caps every session was signed with before they were sized per session.
 * A stored session without caps was authorized with exactly these, so they
 * must never change.
 */
export const LEGACY_REFUND_CAPS: RefundCaps = {
  maxRefundExchangeRate: MAX_REFUND_EXCHANGE_RATE,
  maxRefundGasOverhead: MAX_REFUND_GAS_OVERHEAD,
  maxRefundAmount: MAX_REFUND_AMOUNT,
}

/**
 * Multiplier on the quoted overhead. The overhead is ~inversely proportional
 * to the gas price, so this is how far the gas price (or the ETH price) may
 * fall, or the relay fee rise, during the session's lifetime before an intent
 * needs a new authorization. A regime change (Sepolia moved 1000x in a day)
 * outruns any multiplier; re-authorization covers that.
 */
export const REFUND_GAS_OVERHEAD_HEADROOM = 4n

/**
 * Sanity ceiling on the overhead cap. The cap is sized from an orchestrator
 * HTTP response, so it is bounded independently of it. 100M gas is the
 * quoted overhead for a ~$0.0075 relay fee at ~0.03 Mwei of gas — well past
 * anything plausible — and far inside the uint48 field. The dollar exposure
 * is bounded by `maxRefundAmount` either way.
 */
export const MAX_REFUND_GAS_OVERHEAD_CEILING = 100_000_000n

/** One element's quoted refund, unpacked the way the validator reads it. */
export interface QuotedGasRefund {
  readonly token: Address
  readonly exchangeRate: bigint
  readonly refundAmount: bigint
  readonly gasOverhead: bigint
}

const UINT128_MASK = (1n << 128n) - 1n

const NO_REFUND: QuotedGasRefund = {
  token: zeroAddress,
  exchangeRate: 0n,
  refundAmount: 0n,
  gasOverhead: 0n,
}

/** The subset of a `prepareTransaction` route the refund lives in. */
type IntentRouteShape = {
  readonly intentOp?: {
    readonly elements?: readonly {
      readonly mandate?: {
        readonly qualifier?: {
          readonly settlementContext?: {
            readonly gasRefund?: {
              readonly token?: Address
              readonly exchangeRate?: bigint | string | number
              readonly overhead?: bigint | string | number
            }
          }
        }
      }
    }[]
  }
}

/**
 * Read every element's quoted refund out of a `prepareTransaction` route.
 *
 * `overhead` packs `refundAmount << 128 | gasOverhead`, as the SDK patch and
 * the validator both unpack it. An element without a refund is the SDK's
 * zero refund, which is what it signs in that case.
 */
export function readQuotedGasRefunds(intentRoute: unknown): QuotedGasRefund[] {
  const elements = (intentRoute as IntentRouteShape | undefined)?.intentOp
    ?.elements
  if (!elements) return []
  return elements.map((element) => {
    const refund = element.mandate?.qualifier?.settlementContext?.gasRefund
    if (!refund?.token) return NO_REFUND
    const overhead = BigInt(refund.overhead ?? 0)
    return {
      token: refund.token,
      exchangeRate: BigInt(refund.exchangeRate ?? 0),
      refundAmount: overhead >> 128n,
      gasOverhead: overhead & UINT128_MASK,
    }
  })
}

export type GasRefundField =
  | 'refundToken'
  | 'exchangeRate'
  | 'refundAmount'
  | 'gasOverhead'

export interface GasRefundViolation {
  readonly field: GasRefundField
  /** The quoted value (0 for a token mismatch). */
  readonly quoted: bigint
  /** The session's cap (0 for a token mismatch). */
  readonly cap: bigint
}

/**
 * Every way `refund` would fail `HCAOwnerAndSessionValidator._checkGasRefund`
 * for a session with `caps` and `refundToken`. Empty means the validator
 * accepts it. The contract reverts on the first; all are returned so a caller
 * can tell an overhead-only miss (fixable with a new session) from one a new
 * session cannot fix.
 */
export function findGasRefundViolations(
  refund: QuotedGasRefund,
  caps: RefundCaps,
  refundToken: Address,
): GasRefundViolation[] {
  if (isAddressEqual(refund.token, zeroAddress)) {
    return refund.exchangeRate !== 0n ||
      refund.refundAmount !== 0n ||
      refund.gasOverhead !== 0n
      ? [{ field: 'refundToken', quoted: 0n, cap: 0n }]
      : []
  }

  const violations: GasRefundViolation[] = []
  if (!isAddressEqual(refund.token, refundToken)) {
    violations.push({ field: 'refundToken', quoted: 0n, cap: 0n })
  }
  if (
    refund.exchangeRate === 0n ||
    refund.exchangeRate > caps.maxRefundExchangeRate
  ) {
    violations.push({
      field: 'exchangeRate',
      quoted: refund.exchangeRate,
      cap: caps.maxRefundExchangeRate,
    })
  }
  if (
    refund.refundAmount === 0n ||
    refund.refundAmount > caps.maxRefundAmount
  ) {
    violations.push({
      field: 'refundAmount',
      quoted: refund.refundAmount,
      cap: caps.maxRefundAmount,
    })
  }
  if (refund.gasOverhead > caps.maxRefundGasOverhead) {
    violations.push({
      field: 'gasOverhead',
      quoted: refund.gasOverhead,
      cap: caps.maxRefundGasOverhead,
    })
  }
  return violations
}

/**
 * Whether a new session could accept `violations`: only an overhead miss
 * within the sanity ceiling can be fixed by re-sizing the overhead cap. The
 * other caps are fixed bounds, and raising them is not something a quote gets
 * to ask for.
 */
export function isFixableByNewSession(
  violations: readonly GasRefundViolation[],
): boolean {
  return (
    violations.length > 0 &&
    violations.every(
      (v) =>
        v.field === 'gasOverhead' &&
        v.quoted <= MAX_REFUND_GAS_OVERHEAD_CEILING,
    )
  )
}

/**
 * Size a session's caps from a quoted overhead: the quote times
 * {@link REFUND_GAS_OVERHEAD_HEADROOM}, never below the legacy 500k and never
 * above {@link MAX_REFUND_GAS_OVERHEAD_CEILING}. Without a quote, the legacy
 * caps.
 */
export function sizeRefundCaps(quotedGasOverhead?: bigint): RefundCaps {
  if (quotedGasOverhead === undefined) return LEGACY_REFUND_CAPS
  const scaled = quotedGasOverhead * REFUND_GAS_OVERHEAD_HEADROOM
  const floored =
    scaled > MAX_REFUND_GAS_OVERHEAD ? scaled : MAX_REFUND_GAS_OVERHEAD
  return {
    ...LEGACY_REFUND_CAPS,
    maxRefundGasOverhead:
      floored > MAX_REFUND_GAS_OVERHEAD_CEILING
        ? MAX_REFUND_GAS_OVERHEAD_CEILING
        : floored,
  }
}

/** The largest overhead across a route's elements, if any carries a refund. */
export function maxQuotedGasOverhead(
  refunds: readonly QuotedGasRefund[],
): bigint | undefined {
  return refunds.reduce<bigint | undefined>(
    (max, r) =>
      isAddressEqual(r.token, zeroAddress)
        ? max
        : max === undefined || r.gasOverhead > max
          ? r.gasOverhead
          : max,
    undefined,
  )
}

export type SessionRefundCapsQuote =
  | { readonly source: 'quote'; readonly caps: RefundCaps }
  | {
      readonly source: 'legacy'
      readonly caps: RefundCaps
      readonly reason: string
    }

/**
 * Size a new session's caps from a live quote, taken BEFORE the session
 * exists (owner-signed — for a standalone HCA the route request is identical
 * either way, so the refund is too).
 *
 * The quoted refund does not depend on the calls, calldata size or gas limit,
 * so a commit-shaped call stands in for every leg. Incoming funds are declared
 * so an empty or undeployed HCA can still be priced.
 *
 * Never fails: without a usable quote it falls back to the legacy caps, and
 * the pre-sign check catches the session later if those are too tight.
 */
export async function quoteSessionRefundCaps(params: {
  readonly rhinestoneAccount: RhinestoneAccount
  readonly chain: Chain
}): Promise<SessionRefundCapsQuote> {
  const { rhinestoneAccount, chain } = params
  try {
    const call = buildCommitCall({
      chainId: chain.id,
      commitment: `0x${'11'.repeat(32)}`,
    })
    const prepared = await rhinestoneAccount.prepareTransaction({
      sourceChains: [chain],
      targetChain: chain,
      calls: [call],
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: 'USDC',
      tokenRequests: [],
      gasLimit: HCA_LEG_GAS_LIMITS.commit,
      auxiliaryFunds: {
        [chain.id]: {
          [getDestinationContracts(chain.id).usdc]: HCA_MAX_LEG_FEES_USDC,
        },
      } as Transaction['auxiliaryFunds'],
    } as Transaction)
    const quoted = maxQuotedGasOverhead(
      readQuotedGasRefunds(
        (prepared as { intentRoute?: unknown } | undefined)?.intentRoute,
      ),
    )
    if (quoted === undefined) {
      return {
        source: 'legacy',
        caps: LEGACY_REFUND_CAPS,
        reason: 'quote carried no gas refund',
      }
    }
    return { source: 'quote', caps: sizeRefundCaps(quoted) }
  } catch (error) {
    return {
      source: 'legacy',
      caps: LEGACY_REFUND_CAPS,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
