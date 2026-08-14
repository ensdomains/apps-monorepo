import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  decodeFunctionData,
  labelhash,
  type PublicClient,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  buildSetResolverCall,
  resolveNameRegistryTarget,
} from './changeResolver'

const PARENT_REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const CHILD_REGISTRY = '0x2222222222222222222222222222222222222222' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address

describe('resolveNameRegistryTarget', () => {
  it('targets ETHRegistry directly for a 2LD', async () => {
    const readContract = vi.fn()

    await expect(
      resolveNameRegistryTarget({
        name: 'LeOn.eth',
        publicClient: { readContract } as never,
      }),
    ).resolves.toEqual({
      isSubname: false,
      label: 'leon',
      registryAddress: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
    })
    expect(readContract).not.toHaveBeenCalled()
  })

  it('walks attached registries to the immediate parent', async () => {
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(PARENT_REGISTRY)
      .mockResolvedValueOnce(CHILD_REGISTRY)

    await expect(
      resolveNameRegistryTarget({
        name: 'leaf.child.parent.eth',
        publicClient: { readContract } as unknown as PublicClient,
      }),
    ).resolves.toEqual({
      isSubname: true,
      label: 'leaf',
      registryAddress: CHILD_REGISTRY,
    })

    expect(readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
        args: ['parent'],
      }),
    )
    expect(readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        address: PARENT_REGISTRY,
        args: ['child'],
      }),
    )
  })
})

describe('buildSetResolverCall', () => {
  it('targets the resolved parent registry and leaf label', () => {
    const call = buildSetResolverCall({
      label: 'leaf',
      newResolver: RESOLVER,
      registryAddress: PARENT_REGISTRY,
    })

    expect(call.to).toBe(PARENT_REGISTRY)
    expect(
      decodeFunctionData({
        abi: permissionedRegistrySetResolverSnippet,
        data: call.data,
      }),
    ).toEqual({
      functionName: 'setResolver',
      args: [BigInt(labelhash('leaf')), RESOLVER],
    })
  })
})
