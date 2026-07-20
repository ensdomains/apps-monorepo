import { type CxOptions, cx } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { EnsInvalidChainIdError } from 'viem'

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs))
}

const SLIP44_MSB = 0x80000000

// The chainId → coinType direction has no local counterpart: use
// `evmChainIdToCoinType` from `@ensdomains/address-encoder/utils`. This inverse
// stays local because it special-cases mainnet (coin 60 → chain 1), which the
// library util deliberately does not.
export function fromCoinType(coinType: bigint): number {
  if (coinType === 60n) return 1 // Special case for Ethereum mainnet

  const chainId = Number(coinType & 0x7fffffffn)
  if (chainId >= SLIP44_MSB || chainId < 0)
    throw new EnsInvalidChainIdError({ chainId })

  return chainId
}
