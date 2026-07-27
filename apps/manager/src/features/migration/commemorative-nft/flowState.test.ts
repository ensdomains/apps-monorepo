import { describe, expect, it } from 'vitest'
import {
  getCommemorativeNftClaimedStatus,
  getCommemorativeNftFlowStatus,
} from './flowState'

const base = {
  eligibilityStatus: 'eligible' as const,
  claimed: false,
  revealComplete: true,
  claimPending: false,
  claimError: false,
}

describe('commemorative NFT flow state', () => {
  it('treats the display-only preview as unclaimed without a chain query', () => {
    expect(
      getCommemorativeNftClaimedStatus({
        preview: true,
        claimed: undefined,
      }),
    ).toBe(false)
    expect(
      getCommemorativeNftClaimedStatus({
        preview: false,
        claimed: undefined,
      }),
    ).toBeUndefined()
  })

  it.each([
    [{ ...base, eligibilityStatus: 'pending' as const }, 'loadingEligibility'],
    [{ ...base, eligibilityStatus: 'ineligible' as const }, 'ineligible'],
    [
      { ...base, eligibilityStatus: 'unavailable' as const },
      'configurationError',
    ],
    [{ ...base, revealComplete: false }, 'revealing'],
    [{ ...base, claimed: undefined }, 'loadingEligibility'],
    [{ ...base, claimed: undefined, claimPending: true }, 'minting'],
    [{ ...base }, 'readyToMint'],
    [{ ...base, claimPending: true }, 'minting'],
    [{ ...base, claimError: true }, 'claimError'],
    [{ ...base, claimed: true }, 'minted'],
    [{ ...base, claimed: true, claimError: true }, 'minted'],
  ])('derives %s as %s', (input, expected) => {
    expect(getCommemorativeNftFlowStatus(input)).toBe(expected)
  })
})
