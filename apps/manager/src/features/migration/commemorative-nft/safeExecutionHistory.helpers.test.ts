import { describe, expect, it } from 'vitest'
import {
  type CommemorativeNftSafeHistoryPage,
  getCommemorativeNftSafeHistoryCheckpoint,
  getCommemorativeNftSafeHistoryPages,
} from './safeExecutionHistory.helpers'

describe('commemorative NFT Safe history planning', () => {
  it('bounds legacy work and searches recent execution history before genesis', () => {
    const pages = getCommemorativeNftSafeHistoryPages({
      searchFromBlock: 0n,
      latestBlock: 1_000_000n,
    })
    expect(pages).toHaveLength(24)
    expect(pages[0]).toEqual({
      kind: 'recent',
      fromBlock: 990_001n,
      toBlock: 1_000_000n,
    })
    expect(pages[1]?.fromBlock).toBe(0n)
    expect(pages.at(-1)?.toBlock).toBe(229_999n)
    expect(
      pages.every(({ fromBlock, toBlock }) => toBlock - fromBlock < 10_000n),
    ).toBe(true)
  })

  it('covers a recent submission with one query and retains its earlier bound on a shorter head', () => {
    const pages = getCommemorativeNftSafeHistoryPages({
      searchFromBlock: 42n,
      latestBlock: 100n,
    })
    expect(pages).toEqual([
      { kind: 'contiguous', fromBlock: 0n, toBlock: 100n },
    ])
    expect(
      getCommemorativeNftSafeHistoryCheckpoint({
        page: { kind: 'contiguous', fromBlock: 0n, toBlock: 40n },
        searchFromBlock: 42n,
      }),
    ).toBe(42n)
  })

  it.each([
    {
      kind: 'recent',
      toBlock: 1_000_000n,
      searchFromBlock: 0n,
      expected: undefined,
    },
    {
      kind: 'contiguous',
      toBlock: 9_999n,
      searchFromBlock: 0n,
      expected: 9_900n,
    },
    {
      kind: 'contiguous',
      toBlock: 19_899n,
      searchFromBlock: 9_900n,
      expected: 19_800n,
    },
    { kind: 'contiguous', toBlock: 42n, searchFromBlock: 0n, expected: 0n },
  ] satisfies readonly {
    readonly kind: CommemorativeNftSafeHistoryPage['kind']
    readonly toBlock: bigint
    readonly searchFromBlock: bigint
    readonly expected: bigint | undefined
  }[])(
    'advances only contiguous $kind history ending at $toBlock',
    ({ kind, toBlock, searchFromBlock, expected }) => {
      expect(
        getCommemorativeNftSafeHistoryCheckpoint({
          page: { kind, fromBlock: searchFromBlock, toBlock },
          searchFromBlock,
        }),
      ).toBe(expected)
    },
  )
})
