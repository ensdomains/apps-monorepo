import { type Address, zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  findCurrentParentRegistries,
  isAcceptedParentRegistry,
  isRegistryCandidate,
  type ParentRegistryReads,
  toCurrentParentRegistries,
} from './currentParentRegistries'
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

describe('isAcceptedParentRegistry', () => {
  it.each([
    ['the computed registry', COMPUTED, undefined, true],
    ['the certified replacement', UPGRADED, UPGRADED, true],
    ['any other registry', OLD_IMPLEMENTATION, UPGRADED, false],
    ['a replacement nobody recorded', UPGRADED, undefined, false],
  ] as const)(
    'accepts %s: %s',
    (_case, registry, currentRegistry, expected) => {
      expect(
        isAcceptedParentRegistry({
          registry,
          expectedRegistry: COMPUTED,
          currentRegistry,
        }),
      ).toBe(expected)
    },
  )
})

describe('isRegistryCandidate', () => {
  it.each([
    ['a replacement registry', UPGRADED, true],
    ['the computed registry', COMPUTED, false],
    ['no registry', zeroAddress, false],
    ['an unread registry', undefined, false],
  ] as const)('%s: %s', (_case, registry, expected) => {
    expect(
      isRegistryCandidate({ registry, hca: HCA, parentName: PARENT }),
    ).toBe(expected)
  })
})

describe('findCurrentParentRegistries', () => {
  const ETH_REGISTRY: Address = '0x00000000000000000000000000000000000000e1'
  const EXAMPLE_REGISTRY: Address = '0x00000000000000000000000000000000000000e2'
  const NESTED = 'sub.example.eth'
  const NESTED_COMPUTED = computeUserRegistryAddress({
    hca: HCA,
    parentName: NESTED,
  })

  /** A chain where `sub.example.eth` was upgraded; any other read fails, as an RPC error would. */
  const reads = (
    overrides: Partial<ParentRegistryReads> = {},
  ): ParentRegistryReads => ({
    getSubregistry: async (registry, label) => {
      if (registry === ETH_REGISTRY && label === 'example')
        return EXAMPLE_REGISTRY
      if (registry === EXAMPLE_REGISTRY && label === 'sub') return UPGRADED
      throw new Error(`no subregistry ${label} on ${registry}`)
    },
    verifyContract: async (registry) => {
      if (registry === UPGRADED) return V2_CONTRACTS.UserRegistryImpl
      throw new Error(`not deployed by the factory: ${registry}`)
    },
    ...overrides,
  })

  const find = (overrides?: Partial<ParentRegistryReads>) =>
    findCurrentParentRegistries({
      reads: reads(overrides),
      ethRegistry: ETH_REGISTRY,
      userRegistryImpl: V2_CONTRACTS.UserRegistryImpl,
      hca: HCA,
      parentNames: [NESTED],
    })

  it('walks the labels down from the .eth registry to the upgraded parent', async () => {
    expect(await find()).toEqual(new Map([[NESTED, UPGRADED]]))
  })

  it.each([
    [
      'a failed registry read',
      {
        getSubregistry: async () => {
          throw new Error('rpc')
        },
      },
    ],
    [
      'a registry read that throws before it starts',
      {
        getSubregistry: () => {
          throw new Error('no readContract on this client')
        },
      },
    ],
    [
      'a failed implementation read',
      {
        verifyContract: async () => {
          throw new Error('rpc')
        },
      },
    ],
  ] as const)('leaves the parent out after %s', async (_case, overrides) => {
    expect((await find(overrides)).size).toBe(0)
  })

  it('does not ask the factory about a parent still at its computed registry', async () => {
    const verifyContract = vi.fn(async () => V2_CONTRACTS.UserRegistryImpl)
    const result = await find({
      getSubregistry: async (registry, label) =>
        registry === ETH_REGISTRY && label === 'example'
          ? EXAMPLE_REGISTRY
          : NESTED_COMPUTED,
      verifyContract,
    })

    expect(result.size).toBe(0)
    expect(verifyContract).not.toHaveBeenCalled()
  })
})
