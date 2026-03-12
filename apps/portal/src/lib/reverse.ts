import type { Address } from 'viem'

/**
 * Get the reverse namespace for a given chain/coin type.
 * Default (addr.reverse) is used for the standard Ethereum reverse record.
 */
export function getReverseNamespace(opts?: {
  chainId?: number
  coinType?: number
}) {
  if (opts?.chainId !== undefined) {
    const coinType = 60 // ETH coin type for Ethereum
    return `${coinType.toString(16)}.reverse`
  }
  if (opts?.coinType !== undefined) {
    return `${opts.coinType.toString(16)}.reverse`
  }
  return 'addr.reverse'
}

/**
 * Get the reverse node name for an address (e.g. "a1b2c3...addr.reverse").
 * Used when resetting primary name via setResolver on the registry.
 */
export function getReverseNode(
  address: Address,
  opts?: { chainId?: number; coinType?: number },
) {
  return `${address.toLowerCase().slice(2)}.${getReverseNamespace(opts)}` as const
}
