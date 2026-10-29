import { describe, expect, it } from 'vitest'
import { USDCIcon } from '@/assets/usdc-icon'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import type { SupportedTokenAddresses } from '../types/tokens'
import { buildTokenData, getSelectedPaymentToken } from './tokenData'

const mockToken = (
  symbol: string,
  address: SupportedTokenAddresses,
  decimals: number,
) => ({
  symbol,
  address,
  decimals,
  Icon: USDCIcon,
})

const validPrice = {
  total: 5_000_000n,
  base: 5_000_000n,
  premium: 0n,
  decimals: USDC_DECIMALS,
  hasPremium: false,
}

describe('buildTokenData', () => {
  it('returns token data with valid prices and balances', () => {
    const tokens = [
      mockToken('USDC', SUPPORTED_TOKENS.USDC, USDC_DECIMALS),
      mockToken('DAI', SUPPORTED_TOKENS.DAI, DAI_DECIMALS),
    ]

    const prices = [validPrice, { ...validPrice, total: 10_000_000n }]
    const balances = [100_000_000n, 50_000_000_000_000_000_000n]

    const result = buildTokenData(tokens, prices, balances, [])

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      ...tokens[0],
      price: validPrice,
      balance: 100_000_000n,
    })
    expect(result[1]).toMatchObject({
      ...tokens[1],
      price: prices[1],
      balance: 50_000_000_000_000_000_000n,
    })
  })

  it('uses 0n when balance is undefined', () => {
    const tokens = [mockToken('USDC', SUPPORTED_TOKENS.USDC, USDC_DECIMALS)]
    const prices = [validPrice]
    const balances = [] as bigint[]

    const result = buildTokenData(tokens, prices, balances, [])

    expect(result[0].price).toEqual(validPrice)
    expect(result[0].balance).toBe(0n)
  })

  it('handles empty tokens array', () => {
    const result = buildTokenData([], [], [], [])

    expect(result).toEqual([])
  })

  it('handles mismatched array lengths by using undefined for missing indices', () => {
    const tokens = [mockToken('USDC', SUPPORTED_TOKENS.USDC, USDC_DECIMALS)]
    const prices = [validPrice]
    const balances = [] as bigint[]

    const result = buildTokenData(tokens, prices, balances, [])

    expect(result[0].balance).toBe(0n)
  })
})

describe('getSelectedPaymentToken', () => {
  const usdc = (balance: bigint) => ({
    address: SUPPORTED_TOKENS.USDC,
    balance,
    price: { total: 5_000_000n },
  })
  const dai = (balance: bigint) => ({
    address: SUPPORTED_TOKENS.DAI,
    balance,
    price: { total: 5_000_000_000_000_000_000n },
  })

  it.each([
    {
      case: 'picks the first token that can pay when none is chosen',
      tokens: [usdc(0n), dai(10n ** 19n)],
      chosen: null,
      expected: SUPPORTED_TOKENS.DAI,
    },
    {
      case: 'keeps a chosen token that can pay',
      tokens: [usdc(10_000_000n), dai(10n ** 19n)],
      chosen: SUPPORTED_TOKENS.DAI,
      expected: SUPPORTED_TOKENS.DAI,
    },
    {
      case: 'drops a chosen token that can no longer pay',
      tokens: [usdc(10_000_000n), dai(0n)],
      chosen: SUPPORTED_TOKENS.DAI,
      expected: SUPPORTED_TOKENS.USDC,
    },
    {
      case: 'selects nothing when no token can pay',
      tokens: [usdc(4_999_999n)],
      chosen: SUPPORTED_TOKENS.USDC,
      expected: undefined,
    },
  ])('$case', ({ tokens, chosen, expected }) => {
    expect(getSelectedPaymentToken(tokens, chosen)?.address).toBe(expected)
  })
})
