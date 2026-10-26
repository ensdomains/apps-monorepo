import { describe, expect, it } from 'vitest'
import { isShortOfApprovalGas } from './l2ApprovalGas'

const gas = (
  overrides: Partial<Parameters<typeof isShortOfApprovalGas>[0]>,
) => ({
  allowance: 0n,
  ethBalance: 0n,
  approvalCost: 100n,
  ...overrides,
})

describe('isShortOfApprovalGas', () => {
  it.each([
    { name: 'no approval and no ETH', input: gas({}), expected: true },
    {
      name: 'ETH covers the approval',
      input: gas({ ethBalance: 100n }),
      expected: false,
    },
    {
      name: 'already approved',
      input: gas({ allowance: 10n }),
      expected: false,
    },
    { name: 'an unread state', input: null, expected: false },
  ])('$name: $expected', ({ input, expected }) => {
    expect(isShortOfApprovalGas(input, 10n)).toBe(expected)
  })

  it('needs nothing when nothing is bridged', () => {
    expect(isShortOfApprovalGas(gas({}), 0n)).toBe(false)
  })
})
