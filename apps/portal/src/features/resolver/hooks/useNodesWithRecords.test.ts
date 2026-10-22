import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { namehash } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { getNodesWithRecordsQueryOptions } from './useNodesWithRecords'

const { mockMulticall } = vi.hoisted(() => ({ mockMulticall: vi.fn() }))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ multicall: mockMulticall }),
}))

const RESOLVER = '0x1111111111111111111111111111111111111111'

describe('getNodesWithRecordsQueryOptions', () => {
  it('keeps only the nodes the resolver holds a record for', async () => {
    const recorded = namehash('recorded.eth')
    const unlinked = namehash('unlinked.eth')
    mockMulticall.mockResolvedValue([3n, 0n])

    const nodes = await new QueryClient().fetchQuery(
      getNodesWithRecordsQueryOptions({
        address: RESOLVER,
        nodes: [recorded, unlinked],
      }),
    )

    expect(nodes).toEqual([recorded])
    expect(mockMulticall).toHaveBeenCalledWith(
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            address: RESOLVER,
            functionName: 'getRecordId',
            args: [recorded],
          }),
          expect.objectContaining({ args: [unlinked] }),
        ],
      }),
    )
  })
})
