import { describe, expect, it } from 'vitest'
import { hasReachedRenewalTarget } from './renewalTarget'

const CURRENT_EXPIRY = 1_800_000_000n
const DURATION = 31_536_000n

describe('hasReachedRenewalTarget', () => {
  it.each([
    { label: 'an unchanged expiry', expiry: CURRENT_EXPIRY, isRenewed: false },
    {
      label: 'an expiry below the paid target',
      expiry: CURRENT_EXPIRY + DURATION - 1n,
      isRenewed: false,
    },
    {
      label: 'the paid target',
      expiry: CURRENT_EXPIRY + DURATION,
      isRenewed: true,
    },
    {
      label: 'an expiry past the paid target',
      expiry: CURRENT_EXPIRY + DURATION + 1n,
      isRenewed: true,
    },
    { label: 'no expiry', expiry: null, isRenewed: false },
  ])('$label counts as renewed: $isRenewed', ({ expiry, isRenewed }) => {
    expect(
      hasReachedRenewalTarget({
        expiry,
        currentExpiry: CURRENT_EXPIRY,
        duration: DURATION,
      }),
    ).toBe(isRenewed)
  })
})
