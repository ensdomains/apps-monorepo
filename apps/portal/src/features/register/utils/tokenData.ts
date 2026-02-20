import type { Address } from 'viem'
import { isPriceResult } from './registrationPrice'

export type TokenPrice = {
  total: string
  totalRaw: bigint
  base: string
  premium: string
  hasPremium: boolean
}

export const DEFAULT_PRICE: TokenPrice = {
  total: '$0',
  totalRaw: 0n,
  base: '$0',
  premium: '$0',
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
      balance: typeof balances[i] === 'bigint' ? (balances[i] as bigint) : 0n,
    }
  })
}
