import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { getTokenDecimals } from './tokenDecimals'

describe('getTokenDecimals', () => {
  it('returns USDC_DECIMALS for USDC', () => {
    expect(getTokenDecimals(SUPPORTED_TOKENS.USDC)).toBe(USDC_DECIMALS)
  })

  it('returns DAI_DECIMALS for DAI', () => {
    expect(getTokenDecimals(SUPPORTED_TOKENS.DAI)).toBe(DAI_DECIMALS)
  })

  it('compares addresses case-insensitively', () => {
    const usdcUpper = SUPPORTED_TOKENS.USDC.toUpperCase() as Address
    const daiLower = SUPPORTED_TOKENS.DAI.toLowerCase() as Address
    expect(getTokenDecimals(usdcUpper)).toBe(USDC_DECIMALS)
    expect(getTokenDecimals(daiLower)).toBe(DAI_DECIMALS)
  })

  it('throws for unsupported token address', () => {
    const unknownToken = '0x0000000000000000000000000000000000000001' as Address
    expect(() => getTokenDecimals(unknownToken)).toThrow(
      `Unsupported token address: ${unknownToken}`,
    )
  })

  it('throws for zero address', () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000' as Address
    expect(() => getTokenDecimals(zeroAddress)).toThrow(
      `Unsupported token address: ${zeroAddress}`,
    )
  })
})
