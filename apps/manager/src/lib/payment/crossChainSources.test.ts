import { describe, expect, it, vi } from 'vitest'

const isFeatureEnabledMock = vi.fn()

vi.mock('@/utils/feature-flags', () => ({
  isFeatureEnabled: (flag: string) => isFeatureEnabledMock(flag),
}))

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC_ADDRESS,
  getPaymentSourceById,
  getPaymentSources,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_USDC_ADDRESS,
} from './crossChainSources'

describe('getPaymentSources', () => {
  it('offers only L1 sources when L2_STABLES is off', () => {
    isFeatureEnabledMock.mockReturnValue(false)

    const sources = getPaymentSources()
    const ids = sources.map((s) => s.id)

    expect(ids).toEqual(['usdc-sepolia', 'dai-sepolia'])
    expect(sources.every((s) => !s.isCrossChain)).toBe(true)
    expect(sources.every((s) => s.sourceChainId === SEPOLIA_CHAIN_ID)).toBe(
      true,
    )
  })

  it('adds the Base Sepolia USDC source when L2_STABLES is on', () => {
    isFeatureEnabledMock.mockReturnValue(true)

    const sources = getPaymentSources()
    const base = sources.find((s) => s.id === 'usdc-base-sepolia')

    expect(base).toBeDefined()
    expect(base?.isCrossChain).toBe(true)
    expect(base?.sourceChainId).toBe(BASE_SEPOLIA_CHAIN_ID)
    expect(base?.sourceTokenAddress).toBe(BASE_SEPOLIA_USDC_ADDRESS)
    // The registrar is charged the canonical Sepolia USDC, not the source token.
    expect(base?.destinationPaymentToken).toBe(SEPOLIA_USDC_ADDRESS)
  })

  it('only the cross-chain source has a differing source/destination token', () => {
    isFeatureEnabledMock.mockReturnValue(true)

    for (const source of getPaymentSources()) {
      if (source.isCrossChain) {
        expect(source.sourceTokenAddress).not.toBe(
          source.destinationPaymentToken,
        )
      } else {
        expect(source.sourceTokenAddress).toBe(source.destinationPaymentToken)
      }
    }
  })
})

describe('getPaymentSourceById', () => {
  it('resolves a known id and returns undefined for an unknown one', () => {
    isFeatureEnabledMock.mockReturnValue(true)

    expect(getPaymentSourceById('usdc-base-sepolia')?.id).toBe(
      'usdc-base-sepolia',
    )
    expect(getPaymentSourceById('nope')).toBeUndefined()
  })
})
