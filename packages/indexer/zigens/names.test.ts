import { describe, expect, it } from 'vitest'
import type { V1Domain } from '../ensnode/types'
import { pickNameDetail } from './names'
import type { V2Domain } from './types'

const NAME_WRAPPER = '0x0635513f179d50a207757e05759cbd106d7dfce8'
const HOLDER = '0x179a862703a4adfb29896552df9e307980d19285'
const NOW = new Date('2026-11-17T12:00:00Z')
const CONTEXT = { now: NOW, nameWrapper: NAME_WRAPPER }

// Rows recorded from Sepolia: afasf.eth from zigens, test.eth from ENSNode.
const v2 = (overrides: Partial<V2Domain> = {}): V2Domain => ({
  id: '0xccf9e52d2de9c7f2c2792c4767522318d95cf7b7e79a3dea4db175b8545c8e1f',
  name: 'afasf.eth',
  labelName: 'afasf',
  labelhash:
    '0xe8c5c8d73378235ad4ededf465ddcc76c2789d9760ed41a210cc78273597f76f',
  normalizedName: 'afasf.eth',
  protocol: 'v2',
  owner: { id: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945' },
  registrant: { id: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945' },
  resolver: { address: '0x5fea82d96b8dd71e33138c6cba615f8bcf088d3a' },
  resolvedAddress: null,
  subregistry: null,
  expiryDate: 1826469384,
  registrationDate: 1794911784,
  createdAt: 1794911784,
  isReachable: true,
  isMigrated: false,
  tokenId: '0xe8c5c8d73378235ad4ededf465ddcc76c2789d9760ed41a210cc782700000000',
  subdomainCount: 0,
  roleHolderCount: 1,
  parent: null,
  ...overrides,
})

const v1 = (overrides: Partial<V1Domain> = {}): V1Domain => ({
  id: '0xeb4f647bea6caa36333c816d7b46fdcb05f9466ecacc140ea8c66faf15b3d9f1',
  name: 'test.eth',
  labelName: 'test',
  labelhash: null,
  owner: { id: NAME_WRAPPER },
  registrant: { id: NAME_WRAPPER },
  wrappedOwner: { id: HOLDER },
  resolver: { address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' },
  resolvedAddress: null,
  expiryDate: '2015726758',
  createdAt: '1690405056',
  subdomainCount: 0,
  parent: null,
  registration: { registrationDate: '1690405056', expiryDate: '2007950758' },
  wrappedDomain: { expiryDate: '1761294960', fuses: 196608 },
  ...overrides,
})

describe('pickNameDetail', () => {
  it('reads an ENSv2 registration from zigens, as bigname reports it', () => {
    expect(pickNameDetail(v2(), v1(), CONTEXT)).toEqual({
      name: 'afasf.eth',
      displayName: 'afasf.eth',
      namehash:
        '0xccf9e52d2de9c7f2c2792c4767522318d95cf7b7e79a3dea4db175b8545c8e1f',
      protocol: 'v2',
      isSupported: true,
      owner: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945',
      manager: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945',
      registrant: null,
      resolver: '0x5fea82d96b8dd71e33138c6cba615f8bcf088d3a',
      registrationStatus: 'active',
      expiresAt: new Date('2027-11-17T16:36:24Z'),
      graceEndsAt: new Date('2027-12-15T16:36:24Z'),
      registeredAt: new Date('2026-11-17T10:36:24Z'),
      registrationId:
        '0xe8c5c8d73378235ad4ededf465ddcc76c2789d9760ed41a210cc782700000000',
      createdAt: new Date('2026-11-17T10:36:24Z'),
      migratedAt: null,
      unresolvableReason: null,
    })
  })

  it('reads a wrapped ENSv1 name from ENSNode, owned and managed by the wrapper token holder', () => {
    expect(pickNameDetail(undefined, v1(), CONTEXT)).toMatchObject({
      protocol: 'v1',
      owner: HOLDER,
      manager: HOLDER,
      registrant: null,
      registrationStatus: 'active',
      expiresAt: new Date(2007950758 * 1000),
      graceEndsAt: new Date(2015726758 * 1000),
    })
  })

  // 1.bitb.eth on Sepolia: unwrapped through the registry, wrapper token left behind.
  it('ignores a stale wrapper token once the registry no longer points at the NameWrapper', () => {
    const owner = '0xf83fe2658f702a072f3c7b0dc4a0ab8c7b044750'

    expect(
      pickNameDetail(
        undefined,
        v1({ owner: { id: owner }, registrant: null, registration: null }),
        CONTEXT,
      ),
    ).toMatchObject({ owner, manager: owner, expiresAt: null })
  })

  it('reads ENSv1 while the ENSv2 row is only a migration reservation', () => {
    const reservation = v2({
      owner: { id: '0x0000000000000000000000000000000000000000' },
    })

    expect(pickNameDetail(reservation, v1(), CONTEXT)?.protocol).toBe('v1')
  })

  it('is null when neither deployment knows the name', () => {
    expect(pickNameDetail(undefined, undefined, CONTEXT)).toBeNull()
  })

  it.each([
    { case: 'in its grace', at: '2027-11-20T00:00:00Z', status: 'expired' },
    { case: 'past its grace', at: '2028-01-01T00:00:00Z', status: 'released' },
  ])('calls an ENSv2 name $case $status', ({ at, status }) => {
    expect(
      pickNameDetail(v2(), undefined, { ...CONTEXT, now: new Date(at) })
        ?.registrationStatus,
    ).toBe(status)
  })
})
