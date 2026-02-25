import type { JSX, SVGProps } from 'react'
import { USDC_DECIMALS } from '@/lib/constants/tokens'
import type { SupportedTokenAddresses } from '../types/tokens'
import { isPriceResult } from './registrationPrice'

export type TokenPrice = {
  readonly total: bigint
  readonly base: bigint
  readonly premium: bigint
  readonly decimals: number
  readonly hasPremium: boolean
}

export const DEFAULT_PRICE: TokenPrice = {
  total: 0n,
  base: 0n,
  premium: 0n,
  decimals: USDC_DECIMALS,
  hasPremium: false,
}

type TokenInput = {
  readonly symbol: string
  readonly address: SupportedTokenAddresses
  readonly decimals: number
  readonly Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element
}

export type TokenWithPriceAndBalance = TokenInput & {
  readonly price: TokenPrice
  readonly balance: bigint
}

export function buildTokenData(
  tokens: readonly TokenInput[],
  prices: readonly (TokenPrice | undefined)[],
  balances: readonly bigint[],
): TokenWithPriceAndBalance[] {
  return tokens.map((token, i) => {
    const price = prices[i]
    return {
      ...token,
      price: price && isPriceResult(price) ? price : DEFAULT_PRICE,
      balance: typeof balances[i] === 'bigint' ? balances[i] : 0n,
    }
  })
}
