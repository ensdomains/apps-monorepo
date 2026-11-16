import { type Address, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import { toCurrentParentRegistries } from './currentParentRegistries'
import { computeUserRegistryAddress } from './userRegistryMigration'

const HCA: Address = '0x00000000000000000000000000000000000000a1'
const PARENT = 'example.eth'
const UPGRADED: Address = '0x00000000000000000000000000000000000000c1'
const OLD_IMPLEMENTATION: Address = '0x00000000000000000000000000000000000000d1'
const COMPUTED = computeUserRegistryAddress({ hca: HCA, parentName: PARENT })

const run = (
  registry: Address | undefined,
  implementation: Address | undefined,
) =>
  toCurrentParentRegistries({
    hca: HCA,
    userRegistryImpl: V2_CONTRACTS.UserRegistryImpl,
    reads: [{ parentName: PARENT, registry, implementation }],
  })

describe('toCurrentParentRegistries', () => {
  it('follows an upgraded parent certified on the current implementation', () => {
    expect(run(UPGRADED, V2_CONTRACTS.UserRegistryImpl)).toEqual(
      new Map([[PARENT, UPGRADED]]),
    )
  })

  it.each([
    ['still at the computed address', COMPUTED, V2_CONTRACTS.UserRegistryImpl],
    ['pointing nowhere', zeroAddress, V2_CONTRACTS.UserRegistryImpl],
    ['on another implementation', UPGRADED, OLD_IMPLEMENTATION],
    ['with an unread implementation', UPGRADED, undefined],
    ['with an unread registry', undefined, undefined],
  ] as const)('leaves out a parent %s', (_case, registry, implementation) => {
    expect(run(registry, implementation).size).toBe(0)
  })
})
