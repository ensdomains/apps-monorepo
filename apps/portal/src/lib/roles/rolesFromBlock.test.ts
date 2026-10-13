import { describe, expect, it } from 'vitest'
import { ROLES_FROM_BLOCK_BY_NETWORK } from './rolesFromBlock'

/**
 * Deployment blocks measured with `eth_getCode` (no code the block before,
 * code at it). The root registry is the earliest v2 contract and the ancestor
 * of every registry, so no role event can predate it.
 */
const DEPLOYMENTS = {
  mainnet: { rootRegistry: 26_105_295n, ethRegistry: 26_105_621n },
  sepolia: { rootRegistry: 11_820_291n, ethRegistry: 11_820_399n },
} as const

describe.each([
  'mainnet',
  'sepolia',
] as const)('ROLES_FROM_BLOCK on %s', (network) => {
  const fromBlock = ROLES_FROM_BLOCK_BY_NETWORK[network]
  const { rootRegistry, ethRegistry } = DEPLOYMENTS[network]

  // Raising this past the root registry silently empties its role table:
  // its root grants all sit in its deployment block, so a later start
  // returns zero logs and the page reads as "nobody holds these roles".
  it('starts no later than the earliest v2 registry', () => {
    expect(fromBlock).toBeLessThanOrEqual(rootRegistry)
  })

  // The .eth registry is deployed later, which is why anchoring on it was
  // wrong. Kept as a guard so that mistake cannot come back quietly.
  it('is not anchored on the .eth registry instead', () => {
    expect(fromBlock).toBeLessThan(ethRegistry)
  })
})
