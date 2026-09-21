import { describe, expect, it } from 'vitest'
import {
  getCommemorativeNftAdmission,
  getCommemorativeNftFlowStatus,
  getCommemorativeNftSessionKey,
} from './flowState'

const base = {
  eligibilityStatus: 'eligible' as const,
  claimed: false,
  claimPending: false,
  claimError: false,
}

describe('commemorative NFT flow state', () => {
  it.each([
    [{ ...base, eligibilityStatus: 'pending' as const }, 'loadingEligibility'],
    [{ ...base, eligibilityStatus: 'ineligible' as const }, 'ineligible'],
    [
      { ...base, eligibilityStatus: 'unavailable' as const },
      'configurationError',
    ],
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

describe('commemorative NFT dialog admission', () => {
  const pending = {
    admitted: false,
    hasOwner: true,
    supported: true,
    eligibilityStatus: 'eligible' as const,
    claimed: undefined,
    isFresh: false,
    claimReadError: false,
    fetchStatus: 'idle' as const,
  }

  it('requires a fresh false before admitting the mint dialog', () => {
    expect(getCommemorativeNftAdmission(pending)).toEqual({
      status: 'checking',
    })
    expect(
      getCommemorativeNftAdmission({ ...pending, claimed: false }),
    ).toEqual({ status: 'checking' })
    expect(
      getCommemorativeNftAdmission({
        ...pending,
        claimed: false,
        isFresh: true,
      }),
    ).toEqual({ status: 'admitted' })
  })

  it('keeps the current session admitted after minting and background errors', () => {
    expect(
      getCommemorativeNftAdmission({
        ...pending,
        admitted: true,
        claimed: true,
      }),
    ).toEqual({ status: 'admitted' })
    expect(
      getCommemorativeNftAdmission({
        ...pending,
        admitted: true,
        claimReadError: true,
      }),
    ).toEqual({ status: 'admitted' })
  })

  it('keeps failed or paused reads outside the artwork dialog', () => {
    expect(
      getCommemorativeNftAdmission({ ...pending, claimReadError: true }),
    ).toEqual({ status: 'unavailable', reason: 'claimReadFailed' })
    expect(
      getCommemorativeNftAdmission({ ...pending, fetchStatus: 'paused' }),
    ).toEqual({ status: 'unavailable', reason: 'offline' })
    expect(
      getCommemorativeNftAdmission({
        ...pending,
        claimReadError: true,
        fetchStatus: 'fetching',
      }),
    ).toEqual({ status: 'checking' })
  })

  it('does not leave a disabled owner query checking forever', () => {
    expect(
      getCommemorativeNftAdmission({ ...pending, hasOwner: false }),
    ).toEqual({ status: 'unavailable', reason: 'ownerMissing' })
  })

  it('falls back when the network or published metadata is unavailable', () => {
    expect(
      getCommemorativeNftAdmission({ ...pending, supported: false }),
    ).toEqual({ status: 'fallback' })
    expect(
      getCommemorativeNftAdmission({
        ...pending,
        eligibilityStatus: 'ineligible',
      }),
    ).toEqual({ status: 'fallback' })
  })

  it('does not let session admission bypass ineligibility', () => {
    expect(
      getCommemorativeNftAdmission({
        ...pending,
        admitted: true,
        eligibilityStatus: 'ineligible',
        claimed: false,
        isFresh: true,
      }),
    ).toEqual({ status: 'fallback' })
  })

  it('remounts admission for owner, chain, and wallet changes', () => {
    const session = {
      chainId: 11155111,
      ownerAddress: '0xABC',
      walletAddress: '0xABC',
    }
    const key = getCommemorativeNftSessionKey(session)
    expect(
      getCommemorativeNftSessionKey({
        ...session,
        ownerAddress: '0xabc',
        walletAddress: '0xabc',
      }),
    ).toBe(key)
    for (const change of [
      { ownerAddress: '0xdef' },
      { walletAddress: '0xdef' },
      { walletAddress: undefined },
      { chainId: 1 },
    ]) {
      expect(getCommemorativeNftSessionKey({ ...session, ...change })).not.toBe(
        key,
      )
    }
  })
})
