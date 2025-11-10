import type { ReverseRegistrarCoinId } from '@ens-apps/l2-primary/reverseRegistrarCoinIds'
import { icons, names } from '@/lib/reverseRegistrarCoinId'

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
   * - 60: Default reverse record (uses reverseRegistrarCoinId parameter)
   * - Other values: Chain IDs (uses chainId parameter)
   */
  reverseRegistrarCoinId: number
  /** Display label */
  label: string
  /** Icon path */
  icon: string
}

/**
 * Default reverse record configuration (addr.reverse namespace)
 */
const DEFAULT_REVERSE_RECORD: ReverseResolutionNetwork = {
  reverseRegistrarCoinId: 60,
  label: 'Default',
  icon: '/icons/Link.svg',
}

/**
 * Create reverse resolution networks from reverseRegistrarCoinId data
 */
function createReverseResolutionNetworks(): ReverseResolutionNetwork[] {
  const networks: ReverseResolutionNetwork[] = [DEFAULT_REVERSE_RECORD]

  for (const reverseRegistrarCoinIdKey of Object.keys(icons)) {
    const reverseRegistrarCoinId = Number(
      reverseRegistrarCoinIdKey,
    ) as ReverseRegistrarCoinId
    networks.push({
      reverseRegistrarCoinId,
      label: names[reverseRegistrarCoinId],
      icon: icons[reverseRegistrarCoinId],
    })
  }

  return networks
}

/**
 * Reverse resolution networks
 * - reverseRegistrarCoinId 60: Default reverse record (addr.reverse namespace)
 * - Chain IDs: L2 chain IDs via ENSIP-23
 */
export const REVERSE_RESOLUTION_NETWORKS: ReverseResolutionNetwork[] =
  createReverseResolutionNetworks()
