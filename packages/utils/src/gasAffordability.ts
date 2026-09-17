/**
 * Whether a wallet can cover the native-currency gas a flow is about to spend.
 *
 * Deliberately pure and balance-agnostic: callers supply the numbers, so the
 * same rule serves a registration checkout, a migration batch, and anything
 * else that spends EOA gas, and it stays testable without a chain.
 *
 * The one rule that matters: a missing balance or a missing estimate is
 * `unknown`, never `short`. A failed RPC read is not evidence the user cannot
 * pay, and a warning shown on a transport blip trains people to ignore it.
 */
export type GasAffordability =
  | { readonly status: 'unknown' }
  | {
      readonly status: 'sufficient'
      readonly requiredWei: bigint
      readonly balanceWei: bigint
    }
  | {
      readonly status: 'short'
      readonly requiredWei: bigint
      readonly balanceWei: bigint
      readonly shortfallWei: bigint
    }

/**
 * Headroom added to the raw estimate, in basis points.
 *
 * Estimates are taken once and held (the portal freezes its preview so the
 * figure does not flicker), but the base fee keeps moving, and a flow's later
 * steps are estimated against state the earlier steps have not created yet.
 * Warning at exactly the estimate would clear a wallet that then runs dry
 * mid-flow, which is worse than warning slightly early.
 */
export const DEFAULT_GAS_HEADROOM_BPS = 2_500n

const BPS_DENOMINATOR = 10_000n

export interface AssessGasAffordabilityParams {
  /** Native balance of the account that will actually send, or null if unread. */
  readonly balanceWei: bigint | null | undefined
  /**
   * Summed fee estimate for every step the flow will send, or null when no
   * estimate has resolved. Zero is a valid estimate and is NOT treated as
   * missing: a flow that spends no gas is affordable by definition.
   */
  readonly estimatedFeeWei: bigint | null | undefined
  /**
   * False when at least one remaining step contributed nothing to the sum, which
   * makes `estimatedFeeWei` a LOWER BOUND rather than the cost.
   *
   * This is the common case mid-flow: a registration cannot encode its `register`
   * call until the commitment exists, so an early sum covers the cheap steps and
   * omits the most expensive one. Clearing a wallet against that partial figure
   * would wave through exactly the user this check exists to stop. A lower bound
   * still proves a shortfall, though, so `short` survives and only `sufficient`
   * degrades to `unknown`.
   */
  readonly isEstimateComplete?: boolean
  readonly headroomBps?: bigint
}

export function assessGasAffordability(
  params: AssessGasAffordabilityParams,
): GasAffordability {
  const {
    balanceWei,
    estimatedFeeWei,
    isEstimateComplete = true,
    headroomBps = DEFAULT_GAS_HEADROOM_BPS,
  } = params

  if (
    balanceWei === null ||
    balanceWei === undefined ||
    estimatedFeeWei === null ||
    estimatedFeeWei === undefined
  ) {
    return { status: 'unknown' }
  }

  // A negative headroom would silently under-require; clamp rather than trust.
  const bps = headroomBps < 0n ? 0n : headroomBps
  const requiredWei =
    estimatedFeeWei + (estimatedFeeWei * bps) / BPS_DENOMINATOR

  if (balanceWei < requiredWei) {
    return {
      status: 'short',
      requiredWei,
      balanceWei,
      shortfallWei: requiredWei - balanceWei,
    }
  }

  // Clearing the lower bound proves nothing about the steps missing from it.
  if (!isEstimateComplete) return { status: 'unknown' }

  return { status: 'sufficient', requiredWei, balanceWei }
}

export interface StepFeeSum {
  /** Null when nothing resolved; otherwise the sum of the steps that did. */
  readonly total: bigint | null
  /**
   * False when a step contributed nothing, so `total` is a lower bound. Pass
   * straight through to `isEstimateComplete` rather than discarding it: the
   * distinction is what stops a partial sum reading as a cheap flow.
   */
  readonly isComplete: boolean
}

/**
 * Sum per-step estimates into one figure for {@link assessGasAffordability}.
 *
 * Reports completeness alongside the total because the two answer different
 * questions: the total says how much is known to be needed, completeness says
 * whether that is the whole cost. A step usually goes missing because it cannot
 * be encoded yet (it depends on state an earlier step has not created), and
 * those pending steps are often the expensive ones.
 */
export function sumStepFees(
  fees: readonly (bigint | null | undefined)[],
): StepFeeSum {
  let total: bigint | null = null
  let isComplete = true
  for (const fee of fees) {
    if (fee === null || fee === undefined) {
      isComplete = false
      continue
    }
    total = (total ?? 0n) + fee
  }
  return { total, isComplete }
}
