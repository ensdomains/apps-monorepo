import { createPublicClient, custom } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { coalesceLatestBlockReads } from './coalesceLatestBlockReads'

const deferred = <T>() => {
  let resolve = (_value: T): void => {}
  let reject = (_reason: unknown): void => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const block = {
  number: '0x1',
  timestamp: '0x3e8',
  hash: `0x${'11'.repeat(32)}`,
  transactions: [],
}

describe('operation-local latest block reads', () => {
  it('shares concurrent latest reads, then reads the head again after settlement', async () => {
    const response = deferred<typeof block>()
    const request = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue({ ...block, number: '0x2' })
    const client = coalesceLatestBlockReads(
      createPublicClient({ transport: custom({ request }) }),
    )
    const first = client.getBlock()
    const second = client.getBlock({ blockTag: 'latest' })
    response.resolve(block)
    expect(
      (await Promise.all([first, second])).map(({ number }) => number),
    ).toEqual([1n, 1n])
    expect(request).toHaveBeenCalledTimes(1)
    expect((await client.getBlock()).number).toBe(2n)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('never shares pinned canonicality checks or full-transaction reads', async () => {
    const request = vi.fn().mockResolvedValue(block)
    const client = coalesceLatestBlockReads(
      createPublicClient({ transport: custom({ request }) }),
    )
    await client.getBlock({ blockNumber: 1n })
    await client.getBlock({ blockNumber: 1n })
    await Promise.all([
      client.getBlock(),
      client.getBlock({ includeTransactions: true }),
    ])
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('shares a failure only while in flight and allows the next read to recover', async () => {
    const response = deferred<typeof block>()
    const request = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue(block)
    const client = coalesceLatestBlockReads(
      createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }),
    )
    const settled = Promise.allSettled([client.getBlock(), client.getBlock()])
    response.reject(new Error('RPC unavailable'))
    expect((await settled).map(({ status }) => status)).toEqual([
      'rejected',
      'rejected',
    ])
    expect(request).toHaveBeenCalledTimes(1)
    expect((await client.getBlock()).number).toBe(1n)
    expect(request).toHaveBeenCalledTimes(2)
  })
})
