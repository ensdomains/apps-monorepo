import type { CoinType } from '../../lib/coinType'
import { icons, names } from '../../lib/coinType'

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
 * Create reverse resolution networks from coinType data
 */
function createReverseResolutionNetworks(): ReverseResolutionNetwork[] {
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
 * Reverse resolution networks
 * - coinType 60: Default reverse record (addr.reverse namespace)
 * - Chain IDs: L2 chain IDs via ENSIP-23
 */
export const REVERSE_RESOLUTION_NETWORKS: ReverseResolutionNetwork[] =
  createReverseResolutionNetworks()
