import { describe, expect, it } from 'vitest'
import {
  assessGasAffordability,
  DEFAULT_GAS_HEADROOM_BPS,
  sumStepFees,
} from './gasAffordability'

describe('assessGasAffordability', () => {
  it('never reports short when the balance could not be read', () => {
    expect(
      assessGasAffordability({ balanceWei: null, estimatedFeeWei: 10n }).status,
    ).toBe('unknown')
    expect(
      assessGasAffordability({ balanceWei: undefined, estimatedFeeWei: 10n })
        .status,
    ).toBe('unknown')
  })

  it('never reports short while the estimate is still missing', () => {
    expect(
      assessGasAffordability({ balanceWei: 0n, estimatedFeeWei: null }).status,
    ).toBe('unknown')
  })

  it('treats a zero estimate as a real answer, not a missing one', () => {
    // A flow that spends no gas is affordable even from an empty wallet.
    expect(
      assessGasAffordability({ balanceWei: 0n, estimatedFeeWei: 0n }),
    ).toEqual({ status: 'sufficient', requiredWei: 0n, balanceWei: 0n })
  })

  it('requires the estimate plus headroom', () => {
    const result = assessGasAffordability({
      balanceWei: 1_000n,
      estimatedFeeWei: 1_000n,
    })
    // 1000 + 25% = 1250, which 1000 does not cover.
    expect(result).toEqual({
      status: 'short',
      requiredWei: 1_250n,
      balanceWei: 1_000n,
      shortfallWei: 250n,
    })
  })

  it('clears a wallet that covers the headroom too', () => {
    expect(
      assessGasAffordability({ balanceWei: 1_250n, estimatedFeeWei: 1_000n })
        .status,
    ).toBe('sufficient')
  })

  it('honours a caller-supplied headroom', () => {
    expect(
      assessGasAffordability({
        balanceWei: 1_000n,
        estimatedFeeWei: 1_000n,
        headroomBps: 0n,
      }).status,
    ).toBe('sufficient')
  })

  it('clamps a negative headroom rather than under-requiring', () => {
    const result = assessGasAffordability({
      balanceWei: 1_000n,
      estimatedFeeWei: 1_000n,
      headroomBps: -5_000n,
    })
    expect(result.status).toBe('sufficient')
    expect(result).toMatchObject({ requiredWei: 1_000n })
  })

  it('uses a 25% default headroom', () => {
    expect(DEFAULT_GAS_HEADROOM_BPS).toBe(2_500n)
  })
})

describe('sumStepFees', () => {
  it('is null when nothing has resolved, so the verdict stays unknown', () => {
    expect(sumStepFees([])).toEqual({ total: null, isComplete: true })
    expect(sumStepFees([null, undefined])).toEqual({
      total: null,
      isComplete: false,
    })
  })

  it('sums the steps that did resolve and flags the sum as partial', () => {
    expect(sumStepFees([100n, null, 250n, undefined])).toEqual({
      total: 350n,
      isComplete: false,
    })
  })

  it('reports a complete sum when every step resolved', () => {
    expect(sumStepFees([100n, 250n])).toEqual({
      total: 350n,
      isComplete: true,
    })
  })

  it('keeps a resolved zero rather than falling back to null', () => {
    expect(sumStepFees([0n])).toEqual({ total: 0n, isComplete: true })
  })
})

describe('assessGasAffordability with a partial estimate', () => {
  // A registration cannot encode `register` until the commitment exists, so the
  // early sum omits the dearest step. Clearing a wallet against it would wave
  // through exactly the user this check exists to stop.
  it('will not clear a wallet against a lower bound', () => {
    expect(
      assessGasAffordability({
        balanceWei: 10_000n,
        estimatedFeeWei: 1_000n,
        isEstimateComplete: false,
      }),
    ).toEqual({ status: 'unknown' })
  })

  it('still reports short when even the lower bound is unaffordable', () => {
    // Missing steps only add cost, so falling under a partial sum is conclusive.
    const result = assessGasAffordability({
      balanceWei: 100n,
      estimatedFeeWei: 1_000n,
      isEstimateComplete: false,
    })
    expect(result.status).toBe('short')
    expect(result).toMatchObject({ requiredWei: 1_250n, balanceWei: 100n })
  })

  it('treats a complete estimate as conclusive in both directions', () => {
    expect(
      assessGasAffordability({
        balanceWei: 10_000n,
        estimatedFeeWei: 1_000n,
        isEstimateComplete: true,
      }).status,
    ).toBe('sufficient')
  })
})
