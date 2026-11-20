import { describe, expect, it } from 'vitest'
import { isShortOfApprovalGas } from './l2ApprovalGas'

const APPROVING = { needsOnchainApproval: true }

describe('isShortOfApprovalGas', () => {
  it.each([
    {
      name: 'no ETH for the approval',
      quote: APPROVING,
      eth: 0n,
      cost: 100n,
      expected: true,
    },
    {
      name: 'ETH covers the approval',
      quote: APPROVING,
      eth: 100n,
      cost: 100n,
      expected: false,
    },
    {
      name: 'a quote with a permit to sign',
      quote: { needsOnchainApproval: false },
      eth: 0n,
      cost: 100n,
      expected: false,
    },
    {
      name: 'no quote yet',
      quote: undefined,
      eth: 0n,
      cost: 100n,
      expected: false,
    },
    {
      name: 'an unread wallet',
      quote: APPROVING,
      eth: undefined,
      cost: 100n,
      expected: false,
    },
    {
      name: 'an unknown cost',
      quote: APPROVING,
      eth: 0n,
      cost: null,
      expected: false,
    },
  ])('$name: $expected', ({ quote, eth, cost, expected }) => {
    expect(isShortOfApprovalGas(quote, eth, cost)).toBe(expected)
  })
})
