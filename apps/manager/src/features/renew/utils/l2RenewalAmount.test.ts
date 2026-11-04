import { describe, expect, it } from 'vitest'
import { getL2RenewalAmountOut } from './l2RenewalAmount'

describe('getL2RenewalAmountOut', () => {
  it.each([
    // 5.50 price + 1.00 fee widened to 1.25, from an empty HCA.
    { hcaBalance: 0n, expected: 6_750_000n },
    // The HCA's balance comes off what is bridged.
    { hcaBalance: 2_000_000n, expected: 4_750_000n },
    // Covered: nothing is bridged.
    { hcaBalance: 6_750_000n, expected: 0n },
    { hcaBalance: 9_000_000n, expected: 0n },
  ])(
    'bridges $expected from a balance of $hcaBalance',
    ({ hcaBalance, expected }) => {
      expect(
        getL2RenewalAmountOut({
          rentTotal: 5_500_000n,
          quotedFeeUsdc: 1_000_000n,
          hcaBalance,
        }),
      ).toBe(expected)
    },
  )
})
