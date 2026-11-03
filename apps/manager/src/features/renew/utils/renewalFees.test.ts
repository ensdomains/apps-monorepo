import { HcaIntentFeeExceedsMaximumError } from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import { describe, expect, it } from 'vitest'
import {
  checkRenewalFees,
  RenewalFeeUnpricedError,
  sumRenewalFees,
} from './renewalFees'

describe('sumRenewalFees', () => {
  it.each([
    { fees: [1n, 2n, 3n], expected: 6n },
    { fees: [], expected: 0n },
    // One unpriced intent leaves the whole fee unknown.
    { fees: [1n, null, 3n], expected: null },
  ])('sums $fees to $expected', ({ fees, expected }) => {
    expect(sumRenewalFees(fees)).toBe(expected)
  })
})

describe('checkRenewalFees', () => {
  it('totals the fees when every intent is priced within its ceiling', () => {
    expect(
      checkRenewalFees([
        { fee: 900_000n, maxFee: 10_000_000n },
        { fee: 1_100_000n, maxFee: 1_100_000n },
      ])._unsafeUnwrap(),
    ).toBe(2_000_000n)
  })

  it('refuses when any intent could not be priced', () => {
    expect(
      checkRenewalFees([
        { fee: 900_000n, maxFee: 10_000_000n },
        { fee: null, maxFee: 10_000_000n },
      ])._unsafeUnwrapErr(),
    ).toBeInstanceOf(RenewalFeeUnpricedError)
  })

  it('refuses a fee above its own intent ceiling, naming both', () => {
    const error = checkRenewalFees([
      { fee: 900_000n, maxFee: 10_000_000n },
      { fee: 12_000_000n, maxFee: 11_000_000n },
    ])._unsafeUnwrapErr()

    expect(error).toBeInstanceOf(HcaIntentFeeExceedsMaximumError)
    expect(error).toMatchObject({
      quotedFeeUsdc: 12_000_000n,
      expectedMaximum: 11_000_000n,
    })
  })
})
