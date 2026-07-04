import { type CxOptions, cx } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { EnsInvalidChainIdError } from 'viem'

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs))
}

const SLIP44_MSB = 0x80000000

export function fromCoinType(coinType: bigint): number {
  if (coinType === 60n) return 1 // Special case for Ethereum mainnet

  const chainId = Number(coinType & 0x7fffffffn)
  if (chainId >= SLIP44_MSB || chainId < 0)
    throw new EnsInvalidChainIdError({ chainId })

  return chainId
}

/** Inverse of {@link fromCoinType}: maps an EVM chain id to its ENSIP-11 coin type. */
export function toCoinType(chainId: number): number {
  if (chainId === 1 || chainId === 60) return 60 // Ethereum mainnet
  return (SLIP44_MSB | chainId) >>> 0
}
