import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import { icons, names } from '@/lib/reverseRegistrarChainId'
import { toCoinType } from '@/lib/utils'

/**
 * ENSIP-19 "default" EVM address coin type (`0x80000000`) — the fallback
 * address that applies to any EVM chain without a chain-specific record, and
 * the `default.reverse` namespace for reverse resolution.
 */
export const DEFAULT_COIN_TYPE = 0x80000000
/** Ethereum mainnet coin type (SLIP-44 / `addr.reverse`). */
export const MAINNET_COIN_TYPE = 60

export type ForwardResolutionNetwork = {
  /** ENSIP-11 / SLIP-44 coin type the address record is keyed on. */
  coinType: number
  label: string
  icon: string
  /**
   * L2 chain id — present only for L2 rows, used to read that chain's reverse
   * registrar. Absent for the Default and Mainnet rows (which read via L1
   * `getName`).
   */
  l2ChainId?: ReverseRegistrarChainId
}

const L2_CHAIN_IDS = [10, 42161, 8453, 59144, 534352] as const

/**
 * The networks shown on the name-view forward-resolution page.
 *
 * "Default" (`0x80000000`) and "Mainnet" (60) are distinct coin types: Default
 * applies to every EVM chain, Mainnet only to Ethereum L1.
 */
export const FORWARD_RESOLUTION_NETWORKS: ForwardResolutionNetwork[] = [
  { coinType: DEFAULT_COIN_TYPE, label: 'Default', icon: '/icons/Link.svg' },
  { coinType: MAINNET_COIN_TYPE, label: 'Mainnet', icon: icons[60] },
  ...L2_CHAIN_IDS.map((chainId) => ({
    coinType: toCoinType(chainId),
    label: names[chainId],
    icon: icons[chainId],
    l2ChainId: chainId,
  })),
]
