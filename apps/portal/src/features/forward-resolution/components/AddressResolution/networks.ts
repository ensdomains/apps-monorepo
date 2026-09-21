import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
  type L2ReverseRegistrarChainId,
} from '@ens-apps/l2-primary/v1'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import { icons, names } from '@/lib/reverseRegistrarChainId'
import type { AddressResolutionRow } from './types'

export type ForwardResolutionNetwork = {
  /**
   * ENSIP-11 / SLIP-44 coin type the address record is keyed on. The explorer
   * runs against Sepolia, so L2 coin types derive from the TESTNET chain ids
   * (e.g. Base → `0x80000000 | 84532`) — that's what the deployed Sepolia
   * UniversalResolver / L2 reverse registrars verify against.
   */
  coinType: number
  label: string
  icon: string
  /**
   * L2 chain id — present only for L2 rows, used to read/write that chain's
   * reverse registrar. Absent for the Default and Mainnet rows (which read via
   * L1 `getName`).
   */
  l2ChainId?: L2ReverseRegistrarChainId
}

/**
 * The networks shown on the name-view forward-resolution page.
 *
 * "Default" (`0x80000000`) and "Mainnet" (60) are distinct coin types: Default
 * applies to every EVM chain, Mainnet only to Ethereum L1.
 */
export const FORWARD_RESOLUTION_NETWORKS: ForwardResolutionNetwork[] = [
  {
    coinType: DEFAULT_EVM_COIN_TYPE,
    label: 'Default',
    icon: '/icons/Link.svg',
  },
  { coinType: MAINNET_COIN_TYPE, label: 'Mainnet', icon: icons[60] },
  ...L2_REVERSE_REGISTRAR_CHAIN_IDS.map((chainId) => ({
    coinType: getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia'),
    label: names[chainId],
    icon: icons[chainId],
    l2ChainId: chainId,
  })),
]

/**
 * Rough time until an L2 reverse-registrar write becomes visible through the
 * L1 UniversalResolver on Sepolia — the L2 state root / rollup assertion must
 * first be posted to L1 before the verifying gateway can prove it.
 */
export const L1_VERIFICATION_LAG_ESTIMATES: Record<
  L2ReverseRegistrarChainId,
  string
> = {
  10: 'up to a few days',
  8453: 'up to a few days',
  42161: 'about 7.6 hours',
  59144: 'about 4 hours',
  534352: 'about 1–2 hours',
}

/**
 * Resolved forward address for a network, and where it came from: the network's
 * own record, or — for L2s without one — the ENSIP-19 default (`0x80000000`).
 * The default is this app's client-side fallback, not a record the owner set,
 * so callers must render the two differently.
 */
export function forwardAddress(
  { coinType, l2ChainId }: ForwardResolutionNetwork,
  addressByCoinType: Map<number, string>,
): Pick<AddressResolutionRow, 'address' | 'addressSource'> {
  const own = addressByCoinType.get(coinType) ?? null
  if (own) return { address: own, addressSource: 'record' }

  const fallback =
    l2ChainId != null
      ? (addressByCoinType.get(DEFAULT_EVM_COIN_TYPE) ?? null)
      : null
  return { address: fallback, addressSource: fallback ? 'default' : null }
}
