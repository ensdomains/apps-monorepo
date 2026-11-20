import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  type PublicClient,
  toHex,
  zeroAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it, vi } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  copyParentNames,
  findCurrentParentRegistries,
  isAcceptedParentRegistry,
  type ParentRegistryReads,
  parentUserRegistryFor,
  readCurrentParentRegistries,
} from './currentParentRegistries'
import { computeUserRegistryAddress } from './userRegistryMigration'

const HCA: Address = '0x00000000000000000000000000000000000000a1'
const PARENT = 'example.eth'
const UPGRADED: Address = '0x00000000000000000000000000000000000000c1'
const OLD_IMPLEMENTATION: Address = '0x00000000000000000000000000000000000000d1'
const COMPUTED = computeUserRegistryAddress({ hca: HCA, parentName: PARENT })

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

describe('findCurrentParentRegistries', () => {
  /** A chain where `example.eth` was upgraded to a certified registry; other reads use the overrides. */
  const find = (overrides: Partial<ParentRegistryReads> = {}) =>
    findCurrentParentRegistries({
      reads: {
        getNameRegistry: async () => UPGRADED,
        verifyContract: async () => V2_CONTRACTS.UserRegistryImpl,
        ...overrides,
      },
      userRegistryImpl: V2_CONTRACTS.UserRegistryImpl,
      hca: HCA,
      parentNames: [PARENT],
    })

  it('follows an upgraded parent certified on the current implementation', async () => {
    expect(await find()).toEqual(new Map([[PARENT, UPGRADED]]))
  })

  it.each([
    ['still at the computed address', COMPUTED, V2_CONTRACTS.UserRegistryImpl],
    ['pointing nowhere', zeroAddress, V2_CONTRACTS.UserRegistryImpl],
    ['on another implementation', UPGRADED, OLD_IMPLEMENTATION],
    ['not from the factory', UPGRADED, zeroAddress],
  ] as const)(
    'leaves out a parent %s',
    async (_case, registry, implementation) => {
      const result = await find({
        getNameRegistry: async () => registry,
        verifyContract: async () => implementation,
      })

      expect(result.size).toBe(0)
    },
  )

  it('keys the map by lowercase name, so a lookup in any case finds it', async () => {
    const result = await findCurrentParentRegistries({
      reads: {
        getNameRegistry: async () => UPGRADED,
        verifyContract: async () => V2_CONTRACTS.UserRegistryImpl,
      },
      userRegistryImpl: V2_CONTRACTS.UserRegistryImpl,
      hca: HCA,
      parentNames: ['Example.ETH'],
    })

    expect(
      parentUserRegistryFor({
        hca: HCA,
        parentName: 'EXAMPLE.eth',
        currentParentRegistries: result,
      }),
    ).toBe(UPGRADED)
  })

  it('does not ask the factory about a parent still at its computed registry', async () => {
    const verifyContract = vi.fn(async () => V2_CONTRACTS.UserRegistryImpl)
    await find({ getNameRegistry: async () => COMPUTED, verifyContract })

    expect(verifyContract).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a failed registry read',
      {
        getNameRegistry: async () => {
          throw new Error('rpc')
        },
      },
    ],
    [
      'a registry read that throws before it starts',
      {
        getNameRegistry: () => {
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
  ] as const)('rejects after %s', async (_case, overrides) => {
    await expect(find(overrides)).rejects.toMatchObject({
      _tag: 'ParentRegistryReadError',
      parentName: PARENT,
    })
  })
})

describe('readCurrentParentRegistries', () => {
  const HELPER: Address = '0x00000000000000000000000000000000000000e1'
  const read = (readContract: () => Promise<unknown>, signal?: AbortSignal) =>
    readCurrentParentRegistries({
      publicClient: {
        readContract,
        chain: {
          ...sepolia,
          contracts: { ensUniversalHelper: { address: HELPER } },
        },
      } as Pick<PublicClient, 'readContract' | 'chain'>,
      contracts: {
        userRegistryFactory: '0x00000000000000000000000000000000000000f1',
        userRegistryImpl: V2_CONTRACTS.UserRegistryImpl,
      },
      hca: HCA,
      parentNames: [PARENT],
      signal,
    })

  it('reads a revert as no certified registry', async () => {
    const revert = new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({
        abi: [],
        functionName: 'verifyContract',
        data: '0x4c87e2b6',
      }),
      { abi: [], functionName: 'verifyContract' },
    )
    const readContract = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce([UPGRADED])
      .mockRejectedValueOnce(revert)

    expect((await read(readContract)).size).toBe(0)
    expect(readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: HELPER,
        functionName: 'findRegistries',
        args: [toHex(packetToBytes(PARENT))],
      }),
    )
  })

  it("follows the name's own registry, the first of its ancestry", async () => {
    const readContract = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce([UPGRADED, OLD_IMPLEMENTATION, zeroAddress])
      .mockResolvedValueOnce(V2_CONTRACTS.UserRegistryImpl)

    expect(await read(readContract)).toEqual(new Map([[PARENT, UPGRADED]]))
  })

  it('throws before reading when the client has no universal helper', async () => {
    const readContract = vi.fn<() => Promise<unknown>>()
    const reading = readCurrentParentRegistries({
      publicClient: { readContract, chain: sepolia } as Pick<
        PublicClient,
        'readContract' | 'chain'
      >,
      contracts: {
        userRegistryFactory: '0x00000000000000000000000000000000000000f1',
        userRegistryImpl: V2_CONTRACTS.UserRegistryImpl,
      },
      hca: HCA,
      parentNames: [PARENT],
    })

    await expect(reading).rejects.not.toMatchObject({
      _tag: 'ParentRegistryReadError',
    })
    expect(readContract).not.toHaveBeenCalled()
  })

  it('stops waiting on a read once the caller aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    const reading = read(() => new Promise(() => undefined), controller.signal)

    await expect(reading).rejects.toMatchObject({
      _tag: 'ParentRegistryReadError',
    })
  })

  it('rejects when the request itself fails', async () => {
    const readContract = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new HttpRequestError({ url: 'https://rpc' }))

    await expect(read(readContract)).rejects.toMatchObject({
      _tag: 'ParentRegistryReadError',
    })
  })
})

describe('copyParentNames', () => {
  it('lists the parents of journaled copies, without the .eth root', () => {
    expect(
      copyParentNames([
        { name: 'a.eth', action: 'copy' },
        { name: 'b.example.eth', action: 'copy' },
        { name: 'c.example.eth', action: 'copy' },
        { name: 'd.other.eth', action: 'migrate' },
      ]),
    ).toEqual(['example.eth'])
  })
})
