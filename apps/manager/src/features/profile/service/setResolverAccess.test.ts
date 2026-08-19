import {
  type Address,
  ExecutionRevertedError,
  type PublicClient,
  RpcRequestError,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { canSetNameResolver } from './setResolverAccess'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address

const clientWith = (call: PublicClient['call']) =>
  ({ call }) as unknown as PublicClient

const probe = (publicClient: PublicClient) =>
  canSetNameResolver({
    name: 'leon.eth',
    resolver: RESOLVER,
    ownerAddress: OWNER,
    publicClient,
  })

describe('canSetNameResolver', () => {
  it('probes the registry as the owner and reports a passing simulation', async () => {
    const call = vi.fn(async () => ({ data: undefined })) as never

    await expect(probe(clientWith(call))).resolves.toBe(true)
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ account: OWNER }),
    )
  })

  it('reports false when the registry rejects the caller', async () => {
    const call = vi.fn(async () => {
      throw new ExecutionRevertedError({ message: 'Unauthorized' })
    }) as never

    await expect(probe(clientWith(call))).resolves.toBe(false)
  })

  it('throws on a non-revert failure so authority stays unknown', async () => {
    const call = vi.fn(async () => {
      throw new RpcRequestError({
        body: {},
        error: { code: -32603, message: 'internal error' },
        url: 'http://rpc.test',
      })
    }) as never

    await expect(probe(clientWith(call))).rejects.toThrow(/internal error/i)
  })
})
