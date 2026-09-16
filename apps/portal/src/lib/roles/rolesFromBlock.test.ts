import { describe, expect, it } from 'vitest'
import { ROLES_FROM_BLOCK } from './rolesFromBlock'

/**
 * Deployment blocks measured on Sepolia by binary searching `eth_getCode`.
 * The root registry is the earliest v2 contract and the ancestor of every
 * registry, so no role event can predate it.
 */
const ROOT_REGISTRY_DEPLOYMENT = 11_383_818n
const ETH_REGISTRY_DEPLOYMENT = 11_383_897n

describe('ROLES_FROM_BLOCK', () => {
  // Raising this past the root registry silently empties its role table:
  // its three root grants all sit in its deployment block, so a later start
  // returns zero logs and the page reads as "nobody holds these roles".
  it('starts no later than the earliest v2 registry', () => {
    expect(ROLES_FROM_BLOCK).toBeLessThanOrEqual(ROOT_REGISTRY_DEPLOYMENT)
  })

  // The .eth registry is 79 blocks later, which is why anchoring on it was
  // wrong. Kept as a guard so that mistake cannot come back quietly.
  it('is not anchored on the .eth registry instead', () => {
    expect(ROLES_FROM_BLOCK).toBeLessThan(ETH_REGISTRY_DEPLOYMENT)
  })
})
