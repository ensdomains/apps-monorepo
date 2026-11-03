import { describe, expect, it } from 'vitest'
import { getCheckoutSummary, getCheckoutTotalUsd } from './checkoutSummary'

describe('getCheckoutSummary', () => {
  it.each([
    ['no existing balance', 330_000_000n, 0n, 0n, 330_000_000n],
    [
      'a balance below the name cost',
      330_000_000n,
      3_000_000n,
      3_000_000n,
      327_000_000n,
    ],
    [
      'a balance above the name cost',
      16_520_000n,
      25_610_000n,
      16_520_000n,
      0n,
    ],
  ])('%s', (_case, nameCost, accountBalance, existingBalance, total) => {
    expect(getCheckoutSummary(nameCost, accountBalance)).toEqual({
      nameCostRaw: nameCost,
      existingBalanceRaw: existingBalance,
      totalRaw: total,
    })
  })
})

describe('getCheckoutTotalUsd', () => {
  it.each([
    ['both known', 330_000_000n, 3_000_000n, 327],
    ['the price still loading', undefined, 3_000_000n, undefined],
    ['the balance still loading', 330_000_000n, undefined, undefined],
  ])('%s', (_case, nameCost, accountBalance, expected) => {
    expect(getCheckoutTotalUsd(nameCost, accountBalance)).toBe(expected)
  })
})
