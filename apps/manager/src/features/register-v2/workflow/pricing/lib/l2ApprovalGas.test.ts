import { describe, expect, it } from 'vitest'
import { isShortOfApprovalGas } from './l2ApprovalGas'

const wallet = (overrides: { permit2Allowance?: bigint; eth?: bigint }) => ({
  usdc: 1_000n,
  permit2Allowance: 0n,
  eth: 0n,
  ...overrides,
})

describe('isShortOfApprovalGas', () => {
  it.each([
    {
      name: 'no approval and no ETH',
      w: wallet({}),
      cost: 100n,
      expected: true,
    },
    {
      name: 'ETH covers the approval',
      w: wallet({ eth: 100n }),
      cost: 100n,
      expected: false,
    },
    {
      name: 'already approved',
      w: wallet({ permit2Allowance: 10n }),
      cost: 100n,
      expected: false,
    },
    { name: 'an unread wallet', w: null, cost: 100n, expected: false },
    { name: 'an unknown cost', w: wallet({}), cost: null, expected: false },
  ])('$name: $expected', ({ w, cost, expected }) => {
    expect(isShortOfApprovalGas(w, 10n, cost)).toBe(expected)
  })

  it('needs nothing when nothing is bridged', () => {
    expect(isShortOfApprovalGas(wallet({}), 0n, 100n)).toBe(false)
  })
})
