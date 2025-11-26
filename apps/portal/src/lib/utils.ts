import { type CxOptions, cx } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import type { Address } from 'viem'
import { EnsInvalidChainIdError, zeroAddress } from 'viem'

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

export const isZeroAddress = (addr: Address | null | undefined) =>
  !addr || addr === (zeroAddress as Address)
