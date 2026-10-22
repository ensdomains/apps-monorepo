import { describe, expect, it } from 'vitest'
import {
  MAINNET_ROLES_FROM_BLOCK,
  SEPOLIA_ROLES_FROM_BLOCK,
} from './rolesFromBlock'

/**
 * Deployment blocks of each network's live root and .eth registries, measured
 * with `eth_getCode` (no code the block before, code at it). Mainnet's root was
 * redeployed after its .eth registry, so either can be the earliest.
 */
const NETWORKS = {
  mainnet: {
    fromBlock: MAINNET_ROLES_FROM_BLOCK,
    rootRegistry: 26_183_742n,
    ethRegistry: 26_105_621n,
  },
  sepolia: {
    fromBlock: SEPOLIA_ROLES_FROM_BLOCK,
    rootRegistry: 11_820_291n,
    ethRegistry: 11_820_399n,
  },
} as const

describe.each(['mainnet', 'sepolia'] as const)(
  'ROLES_FROM_BLOCK on %s',
  (network) => {
    // Raising this past a live registry's deployment silently empties its role
    // table: its root grants all sit in its deployment block, so a later start
    // returns zero logs and the page reads as "nobody holds these roles". On
    // Sepolia this also rules out anchoring on the .eth registry, 108 blocks on.
    it('starts no later than the earliest live v2 registry', () => {
      const { fromBlock, rootRegistry, ethRegistry } = NETWORKS[network]
      const earliest = rootRegistry < ethRegistry ? rootRegistry : ethRegistry

      expect(fromBlock).toBeLessThanOrEqual(earliest)
    })
  },
)
