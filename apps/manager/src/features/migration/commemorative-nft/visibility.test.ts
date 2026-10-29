import { describe, expect, it } from 'vitest'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import type { CommemorativeNftEligibility } from './types'
import {
  getAutomaticNftCompletionMode,
  getVisibleCommemorativeNftEligibility,
} from './visibility'

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const eligibility: CommemorativeNftEligibility = {
  ...createCommemorativeNftPreviewEligibility({ ownerAddress }),
  source: 'static',
  proof: ['0x017995f95e79303c1853e326b15e6dcc16e6aa20f07372e4f0ab63c0b84f2631'],
  assets: { metadataUrl: 'https://assets.example/token/42.json' },
}
const defaults = {
  featureEnabled: true,
  ownerAddress,
  supported: true,
  result: { status: 'eligible', eligibility },
  hasFreshEligibilityResult: true,
  minted: false,
} as const

describe('automatic migration completion display', () => {
  it.each([
    [{ isPending: true }, 'wait'],
    [{}, 'known-incomplete'],
    [{ isError: true }, 'verify'],
    [{ hasEligibleNames: false }, 'verify'],
    [{ isSameChain: false }, 'verify'],
    [{ isRecovering: true }, 'verify'],
  ] as const)(
    'chooses %s without authorizing minting',
    (overrides, expected) => {
      expect(
        getAutomaticNftCompletionMode({
          isSameChain: true,
          isRecovering: false,
          isPending: false,
          isError: false,
          hasEligibleNames: true,
          ...overrides,
        }),
      ).toBe(expected)
    },
  )
})

describe('commemorative NFT visibility', () => {
  it.each([false, true])(
    'hides cached eligibility when the feature is disabled (minted: %s)',
    (minted) => {
      expect(
        getVisibleCommemorativeNftEligibility({
          ...defaults,
          featureEnabled: false,
          minted,
        }),
      ).toBeUndefined()
    },
  )

  it('shows published eligibility only after validating the current owner', () => {
    expect(getVisibleCommemorativeNftEligibility(defaults)).toBe(eligibility)
    expect(
      getVisibleCommemorativeNftEligibility({
        ...defaults,
        ownerAddress: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
      }),
    ).toBe(eligibility)
  })

  it.each([
    undefined,
    { status: 'ineligible' },
    { status: 'unavailable' },
  ] as const)(
    'hides non-eligible results even for a previously minted token: %j',
    (result) => {
      for (const minted of [false, true]) {
        expect(
          getVisibleCommemorativeNftEligibility({
            ...defaults,
            result,
            minted,
          }),
        ).toBeUndefined()
      }
    },
  )

  it('hides unminted offers during initial loading or metadata revalidation', () => {
    expect(
      getVisibleCommemorativeNftEligibility({
        ...defaults,
        hasFreshEligibilityResult: false,
      }),
    ).toBeUndefined()
  })

  it('keeps a valid minted card visible through a background refresh', () => {
    expect(
      getVisibleCommemorativeNftEligibility({
        ...defaults,
        hasFreshEligibilityResult: false,
        minted: true,
      }),
    ).toBe(eligibility)
  })

  it.each([
    { ownerAddress: undefined },
    { ownerAddress: '0x1111111111111111111111111111111111111111' as const },
    { supported: false },
  ])('hides stale wallet and network results: %j', (overrides) => {
    expect(
      getVisibleCommemorativeNftEligibility({ ...defaults, ...overrides }),
    ).toBeUndefined()
  })

  it.each([{ source: 'preview' as const }, { proof: [] }, { assets: {} }])(
    'hides unpublished eligibility: %j',
    (overrides) => {
      expect(
        getVisibleCommemorativeNftEligibility({
          ...defaults,
          result: {
            status: 'eligible',
            eligibility: { ...eligibility, ...overrides },
          },
        }),
      ).toBeUndefined()
    },
  )
})
