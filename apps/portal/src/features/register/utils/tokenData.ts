import type { JSX, SVGProps } from 'react'
import type { SupportedTokenAddresses } from '../types/tokens'

export type TokenPrice = {
  readonly total: bigint
  readonly base: bigint
  readonly premium: bigint
  readonly decimals: number
  readonly hasPremium: boolean
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
  readonly allowance: bigint
}

export function buildTokenData(
  tokens: readonly TokenInput[],
  // Resolved prices only: a failed read must block checkout, never price at zero.
  prices: readonly TokenPrice[],
  balances: readonly bigint[],
  allowances: readonly bigint[],
): TokenWithPriceAndBalance[] {
  return tokens.map((token, i) => ({
    ...token,
    price: prices[i],
    balance: typeof balances[i] === 'bigint' ? balances[i] : 0n,
    allowance: typeof allowances[i] === 'bigint' ? allowances[i] : 0n,
  }))
}
