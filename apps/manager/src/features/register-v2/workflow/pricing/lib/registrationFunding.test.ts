import { describe, expect, it } from 'vitest'
import { computeRegistrationFunding } from './registrationFunding'

const USDC = 6

/** The live failure this gate was built for: 20.000000 held, 20.196054 needed. */
const PRODUCTION_FAILURE = {
  total: 20_196_054n,
  registrationPrice: 8_000_021n,
}

describe('computeRegistrationFunding', () => {
  it('splits the budget into the rent and the network fee', () => {
    const funding = computeRegistrationFunding({
      budget: PRODUCTION_FAILURE,
      walletBalanceRaw: 50_000_000n,
      decimals: USDC,
    })

    expect(funding?.registration).toBe(8.000021)
    expect(funding?.networkFee).toBe(12.196033)
    expect(funding?.total).toBe(20.196054)
    // The fee is the remainder, so the parts must reconstruct the debit exactly.
    expect(
      (funding?.registration ?? 0) + (funding?.networkFee ?? 0),
    ).toBeCloseTo(funding?.total ?? 0, 6)
  })

  it('flags the wallet that covers the price but not the budget', () => {
    // Exactly the production case: 20 USDC against an 8 USDC name. The token
    // picker sees 20 > 8 and lets it through; the budget is what it fails on.
    const funding = computeRegistrationFunding({
      budget: PRODUCTION_FAILURE,
      walletBalanceRaw: 20_000_000n,
      decimals: USDC,
    })

    expect(funding?.isUnderfunded).toBe(true)
    expect(funding?.walletBalance).toBe(20)
    expect(funding?.registration).toBeLessThan(funding?.walletBalance ?? 0)
  })

  it('allows a wallet holding exactly the budget', () => {
    const funding = computeRegistrationFunding({
      budget: PRODUCTION_FAILURE,
      walletBalanceRaw: 20_196_054n,
      decimals: USDC,
    })

    expect(funding?.isUnderfunded).toBe(false)
  })

  it('does not block when the balance could not be read', () => {
    // The machine re-checks before signing the permit. Treating an unreadable
    // balance as insufficient would strand a wallet that can actually pay.
    const funding = computeRegistrationFunding({
      budget: PRODUCTION_FAILURE,
      walletBalanceRaw: null,
      decimals: USDC,
    })

    expect(funding?.isUnderfunded).toBe(false)
    expect(funding?.walletBalance).toBeNull()
  })

  it('returns null when no budget has been quoted', () => {
    // A flaky orchestrator must fall back to showing the price, not to a block.
    expect(
      computeRegistrationFunding({
        budget: undefined,
        walletBalanceRaw: 20_000_000n,
        decimals: USDC,
      }),
    ).toBeNull()
  })

  it('never renders a negative fee when the quote prices the legs at zero', () => {
    const funding = computeRegistrationFunding({
      budget: { total: 8_000_021n, registrationPrice: 8_000_021n },
      walletBalanceRaw: 20_000_000n,
      decimals: USDC,
    })

    expect(funding?.networkFee).toBe(0)
    expect(funding?.isUnderfunded).toBe(false)
  })
})
