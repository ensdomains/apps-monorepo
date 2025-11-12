import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import { icons, names } from '@/lib/reverseRegistrarChainId'

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
   * - 60: Default reverse record (uses reverseRegistrarChainId parameter)
   * - Other values: Chain IDs (uses chainId parameter)
   */
  reverseRegistrarChainId: ReverseRegistrarChainId
  /** Display label */
  label: string
  /** Icon path */
  icon: string
}

/**
 * Default reverse record configuration (addr.reverse namespace)
 */
const DEFAULT_REVERSE_RECORD: ReverseResolutionNetwork = {
  reverseRegistrarChainId: 60,
  label: 'Default',
  icon: '/icons/Link.svg',
}

/**
 * Create reverse resolution networks from reverseRegistrarChainId data
 */
function createReverseResolutionNetworks(): ReverseResolutionNetwork[] {
  const networks: ReverseResolutionNetwork[] = [DEFAULT_REVERSE_RECORD]

  for (const reverseRegistrarChainIdKey of Object.keys(icons)) {
    const reverseRegistrarChainId = Number(
      reverseRegistrarChainIdKey,
    ) as ReverseRegistrarChainId
    networks.push({
      reverseRegistrarChainId,
      label: names[reverseRegistrarChainId],
      icon: icons[reverseRegistrarChainId],
    })
  }

  return networks
}

/**
 * Reverse resolution networks
 * - reverseRegistrarChainId 60: Default reverse record (addr.reverse namespace)
 * - Chain IDs: L2 chain IDs via ENSIP-23
 */
export const REVERSE_RESOLUTION_NETWORKS: ReverseResolutionNetwork[] =
  createReverseResolutionNetworks()
