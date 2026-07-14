import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import { evmChainIdToCoinType } from '@ensdomains/address-encoder/utils'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import { icons, names } from '@/lib/reverseRegistrarChainId'

/**
 * Configuration for reverse resolution (ENSIP-19 / ENSIP-23)
 *
 * Each network is keyed by its coin type — the stable identity used to route
 * reads and to track the selected sidebar row:
 * - `0x80000000` (`default.reverse`): the ENSIP-19 cross-chain fallback primary
 * - `60` (`addr.reverse`): the mainnet ETH reverse record
 * - `0x80000000 | chainId`: per-L2 reverse records (ENSIP-23)
 *
 * `default.reverse` (`0x80000000`) and mainnet (`60`) are SEPARATE records:
 * coin 60 does not imply the default is set, and vice versa. They are shown as
 * distinct rows.
 */

/**
 * Chain/network configuration for reverse resolution display
 */
export type ReverseResolutionNetwork = {
  /** Coin type identifying this reverse namespace — the stable row id. */
  coinType: number
  /**
   * L2 reverse-registrar chain id, used to route L2 `nameForAddr` reads and
   * writes. Absent for the Default (`0x80000000`) row, which lives on L1.
   */
  reverseRegistrarChainId?: ReverseRegistrarChainId
  /** Display label */
  label: string
  /** Icon path */
  icon: string
}

/**
 * ENSIP-19 `default.reverse` — the cross-chain fallback primary name. Read-only
 * in this view for now (writes go through the `DefaultReverseRegistrar`).
 */
const DEFAULT_REVERSE_RECORD: ReverseResolutionNetwork = {
  coinType: DEFAULT_EVM_COIN_TYPE,
  label: 'Default',
  icon: '/icons/Link.svg',
}

/** Mainnet ETH `addr.reverse` (SLIP-44 coin 60). */
const MAINNET_REVERSE_RECORD: ReverseResolutionNetwork = {
  coinType: MAINNET_COIN_TYPE,
  reverseRegistrarChainId: 60,
  label: 'Mainnet',
  icon: icons[60],
}

/**
 * Create reverse resolution networks from reverseRegistrarChainId data.
 *
 * L2 reads (`nameForAddr`) are routed through the local `l2WagmiConfig`
 * (see `@/lib/wagmiL2`) instead of the global Sepolia-only wagmi config, so
 * including L2 entries here does NOT affect the explorer's main data path.
 */
function createReverseResolutionNetworks(): ReverseResolutionNetwork[] {
  const networks: ReverseResolutionNetwork[] = [
    DEFAULT_REVERSE_RECORD,
    MAINNET_REVERSE_RECORD,
  ]

  for (const reverseRegistrarChainIdKey of Object.keys(icons)) {
    const reverseRegistrarChainId = Number(
      reverseRegistrarChainIdKey,
    ) as ReverseRegistrarChainId
    // L1 rows (mainnet/"Ethereum") are represented by the Default + Mainnet
    // rows above. Since the explorer operates against Sepolia, both the
    // `60` and `1` entries collapse into those two rows.
    if (reverseRegistrarChainId === 60) continue
    if (reverseRegistrarChainId === 1) continue
    networks.push({
      coinType: evmChainIdToCoinType(reverseRegistrarChainId),
      reverseRegistrarChainId,
      label: names[reverseRegistrarChainId],
      icon: icons[reverseRegistrarChainId],
    })
  }

  return networks
}

/**
 * Reverse resolution networks
 * - `0x80000000`: Default reverse record (`default.reverse`, read-only here)
 * - `60`: Mainnet reverse record (`addr.reverse`)
 * - `0x80000000 | chainId`: L2 reverse records (ENSIP-23)
 */
export const REVERSE_RESOLUTION_NETWORKS: ReverseResolutionNetwork[] =
  createReverseResolutionNetworks()
