import type { Address } from 'viem'
import { USDC_DECIMALS } from '@/lib/constants/tokens'
import { isPriceResult } from './registrationPrice'

export type TokenPrice = {
  total: bigint
  base: bigint
  premium: bigint
  decimals: number
  hasPremium: boolean
}

export const DEFAULT_PRICE: TokenPrice = {
  total: 0n,
  base: 0n,
  premium: 0n,
  decimals: USDC_DECIMALS,
  hasPremium: false,
}

type TokenWithPriceAndBalance<T> = T & { price: TokenPrice; balance: bigint }

export function buildTokenData<
  T extends { symbol: string; address: Address; decimals: number },
>(
  tokens: readonly T[],
  prices: (TokenPrice | undefined)[],
  balances: bigint[],
): TokenWithPriceAndBalance<T>[] {
  return tokens.map((token, i) => {
    const price = prices[i]
    return {
      ...token,
      price: price && isPriceResult(price) ? price : DEFAULT_PRICE,
      balance: typeof balances[i] === 'bigint' ? balances[i] : 0n,
    }
  })
}
