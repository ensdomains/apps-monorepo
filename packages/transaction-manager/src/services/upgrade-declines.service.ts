import type { Address } from 'viem'

/**
 * Accounts whose user declined the EIP-7702 upgrade a `ready` wallet asked
 * for, per chain. Kept for the page's lifetime so their flows plan separate
 * EOA transactions instead of asking again.
 */
let declined: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

const keyOf = (address: Address, chainId: number) =>
  `${chainId}:${address.toLowerCase()}`

export const recordUpgradeDecline = (address: Address, chainId: number) => {
  declined = new Set([...declined, keyOf(address, chainId)])
  for (const listener of listeners) listener()
}

export const hasDeclinedUpgrade = (
  address: Address | undefined,
  chainId: number,
): boolean => address !== undefined && declined.has(keyOf(address, chainId))

export const subscribeUpgradeDeclines = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
