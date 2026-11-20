import { describe, expect, it } from 'vitest'
import { decodePowers, diffPowers, toPowerName } from './powers'

// The bitmap Sepolia's ETH registrar granted the owner of afasf.eth.
const OWNER_BITMAP =
  0x0000000000000000000000001110000000000000000000000000000001100000n

describe('decodePowers', () => {
  it('reads roles and their admin roles from a registry bitmap', () => {
    expect(decodePowers(OWNER_BITMAP, 'registry')).toEqual([
      'set_subregistry',
      'set_resolver',
      'admin_set_subregistry',
      'admin_set_resolver',
      'can_transfer_admin',
    ])
  })

  it('reads the same nybbles with resolver meanings', () => {
    expect(decodePowers(1n | (1n << 128n), 'resolver')).toEqual([
      'set_addr',
      'admin_set_addr',
    ])
  })
})

describe('diffPowers', () => {
  it('splits a change into what was granted and what was revoked', () => {
    expect(diffPowers(1n << 24n, 1n << 20n, 'registry')).toEqual({
      powers: ['set_subregistry'],
      addedPowers: ['set_subregistry'],
      removedPowers: ['set_resolver'],
    })
  })
})

describe('toPowerName', () => {
  it.each([
    ['SET_RESOLVER', 'set_resolver'],
    ['SET_RESOLVER_ADMIN', 'admin_set_resolver'],
    ['SET_ADDRESS', 'set_addr'],
    ['SET_ADDRESS_ADMIN', 'admin_set_addr'],
    ['CAN_TRANSFER_ADMIN', 'can_transfer_admin'],
  ])('names %s as %s', (role, power) => {
    expect(toPowerName(role)).toBe(power)
  })
})
