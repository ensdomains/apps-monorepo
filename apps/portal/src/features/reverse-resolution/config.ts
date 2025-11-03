import type { CoinType, SepoliaChainId } from '../../lib/coinType'
import { icons, names, sepoliaIcons, sepoliaNames } from '../../lib/coinType'

/**
 * Configuration for reverse resolution (ENSIP-23)
 *
 * Reverse resolution uses either:
 * - SLIP-44 coin type 60 for the default reverse record (addr.reverse)
 * - Chain IDs for L2-specific reverse records
 */

/**
 * Chain/network configuration for reverse resolution display
 */
export type ReverseResolutionNetwork = {
  /**
   * Chain ID or coin type to use with getName
   * - 60: Default reverse record (uses coinType parameter)
   * - Other values: Chain IDs (uses chainId parameter)
   */
  coinType: number
  /** Display label */
  label: string
  /** Icon path */
  icon: string
}

/**
 * Default reverse record configuration (addr.reverse namespace)
 */
const DEFAULT_REVERSE_RECORD: ReverseResolutionNetwork = {
  coinType: 60,
  label: 'Default',
  icon: '/icons/Link.svg',
}

/**
 * Create mainnet reverse resolution networks from coinType data
 */
function createMainnetNetworks(): ReverseResolutionNetwork[] {
  const networks: ReverseResolutionNetwork[] = [DEFAULT_REVERSE_RECORD]

  for (const coinType of Object.keys(icons) as unknown as CoinType[]) {
    networks.push({
      coinType,
      label: names[coinType],
      icon: icons[coinType],
    })
  }

  return networks
}

/**
 * Create Sepolia testnet networks from coinType data
 */
function createSepoliaNetworks(): ReverseResolutionNetwork[] {
  const networks: ReverseResolutionNetwork[] = [DEFAULT_REVERSE_RECORD]

  for (const chainId of Object.keys(
    sepoliaNames,
  ) as unknown as SepoliaChainId[]) {
    networks.push({
      coinType: chainId,
      label: sepoliaNames[chainId],
      icon: sepoliaIcons[chainId],
    })
  }

  return networks
}

/**
 * Mainnet networks for reverse resolution
 * - coinType 60: Default reverse record (addr.reverse namespace)
 * - Chain IDs: Mainnet L2 chain IDs via ENSIP-23
 */
export const MAINNET_REVERSE_RESOLUTION_NETWORKS: ReverseResolutionNetwork[] =
  createMainnetNetworks()

/**
 * Sepolia testnet networks for reverse resolution
 * - coinType 60: Default reverse record (addr.reverse namespace)
 * - Chain IDs: Sepolia L2 testnet chain IDs via ENSIP-23
 */
export const SEPOLIA_REVERSE_RESOLUTION_NETWORKS: ReverseResolutionNetwork[] =
  createSepoliaNetworks()

/**
 * Get networks based on environment
 */
export const REVERSE_RESOLUTION_NETWORKS = MAINNET_REVERSE_RESOLUTION_NETWORKS
