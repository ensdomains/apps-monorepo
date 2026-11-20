import { type Address, type PublicClient, RpcRequestError } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  createEthCallClient,
  offchainLookupRevert,
  revertWith,
} from '@/test-utils/ethCallClient.fixture'
import { canSetNameResolver } from './setResolverAccess'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const REGISTRY = '0x2222222222222222222222222222222222222222' as Address

const probe = (publicClient: PublicClient) =>
  canSetNameResolver({
    location: { label: 'leon', registryAddress: REGISTRY },
    resolver: RESOLVER,
    ownerAddress: OWNER,
    publicClient,
  })

describe('canSetNameResolver', () => {
  it('probes the registry as the owner and reports a passing simulation', async () => {
    const ethCall = vi.fn(async () => '0x' as const)

    await expect(probe(createEthCallClient(ethCall).client)).resolves.toBe(true)
    expect(ethCall).toHaveBeenCalledWith(
      expect.objectContaining({ from: OWNER, to: REGISTRY }),
    )
  })

  it('reports false when the registry rejects the caller', async () => {
    const { client } = createEthCallClient(async () => {
      throw revertWith()
    })

    await expect(probe(client)).resolves.toBe(false)
  })

  it('reports false without a gateway request when the registry answers with OffchainLookup', async () => {
    const { client, gateway } = createEthCallClient(async () => {
      throw offchainLookupRevert(REGISTRY)
    })

    await expect(probe(client)).resolves.toBe(false)
    expect(gateway).not.toHaveBeenCalled()
  })

  it('throws on a non-revert failure so authority stays unknown', async () => {
    const { client } = createEthCallClient(async () => {
      throw new RpcRequestError({
        body: {},
        error: { code: -32603, message: 'internal error' },
        url: 'http://rpc.test',
      })
    })

    await expect(probe(client)).rejects.toThrow(/internal error/i)
  })
})
