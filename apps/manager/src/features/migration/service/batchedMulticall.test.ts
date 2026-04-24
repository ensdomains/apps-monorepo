import type { PublicClient } from 'viem'
import { multicall } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batchedMulticall } from './batchedMulticall'

vi.mock('viem/actions', () => ({
  multicall: vi.fn(),
}))

const multicallMock = vi.mocked(multicall)

// biome-ignore lint/suspicious/noExplicitAny: test fixture only passed through
type AnyContract = any
const publicClient = {} as PublicClient

const fakeContracts = (n: number): AnyContract[] =>
  Array.from({ length: n }, (_, i) => ({
    address: `0x${String(i).padStart(40, '0')}`,
    abi: [],
    functionName: 'noop',
    args: [i],
  }))

const ok = (n: number) => ({ status: 'success' as const, result: n })

describe('batchedMulticall', () => {
  beforeEach(() => {
    multicallMock.mockReset()
  })

  it('returns an empty array without calling multicall when contracts are empty', async () => {
    const result = await batchedMulticall<number>(publicClient, [])
    expect(result).toEqual([])
    expect(multicallMock).not.toHaveBeenCalled()
  })

  it('issues a single multicall for 1 contract', async () => {
    multicallMock.mockResolvedValueOnce([ok(0)])
    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(1),
    )
    expect(multicallMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
  })

  it('issues a single multicall for exactly 5000 contracts', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 5000 }, (_, i) => ok(i)),
    )
    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(5000),
    )
    expect(multicallMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(5000)
  })

  it('splits 5001 contracts into two chunks of 5000 and 1', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 5000 }, (_, i) => ok(i)),
    )
    multicallMock.mockResolvedValueOnce([ok(5000)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(5001),
    )

    expect(multicallMock).toHaveBeenCalledTimes(2)
    expect(multicallMock.mock.calls[0]?.[1]?.contracts).toHaveLength(5000)
    expect(multicallMock.mock.calls[1]?.[1]?.contracts).toHaveLength(1)
    expect(result).toHaveLength(5001)
  })

  it('splits 10001 contracts into three chunks: 5000, 5000, 1', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 5000 }, (_, i) => ok(i)),
    )
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 5000 }, (_, i) => ok(5000 + i)),
    )
    multicallMock.mockResolvedValueOnce([ok(10000)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(10001),
    )

    expect(multicallMock).toHaveBeenCalledTimes(3)
    expect(multicallMock.mock.calls[0]?.[1]?.contracts).toHaveLength(5000)
    expect(multicallMock.mock.calls[1]?.[1]?.contracts).toHaveLength(5000)
    expect(multicallMock.mock.calls[2]?.[1]?.contracts).toHaveLength(1)
    expect(result).toHaveLength(10001)
  })

  it('preserves cross-chunk result ordering after flattening', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 5000 }, (_, i) => ok(i)),
    )
    multicallMock.mockResolvedValueOnce([ok(5000), ok(5001)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(5002),
    )

    expect(
      result.map((r) => (r.status === 'success' ? r.result : null)),
    ).toEqual(Array.from({ length: 5002 }, (_, i) => i))
  })

  it('always invokes multicall with allowFailure: true and batchSize: 0', async () => {
    multicallMock.mockResolvedValueOnce([ok(0)])
    await batchedMulticall<number>(publicClient, fakeContracts(1))
    const args = multicallMock.mock.calls[0]?.[1]
    expect(args).toMatchObject({ allowFailure: true, batchSize: 0 })
  })

  it('preserves failure entries in the flattened output', async () => {
    const failure = {
      status: 'failure' as const,
      error: new Error('reverted'),
      result: undefined,
    }
    multicallMock.mockResolvedValueOnce([ok(0), failure, ok(2)])
    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(3),
    )
    expect(result[1]?.status).toBe('failure')
    expect(result[0]?.status).toBe('success')
    expect(result[2]?.status).toBe('success')
  })

  it('converts a chunk-level rejection into per-item failure entries instead of throwing', async () => {
    multicallMock.mockRejectedValueOnce(new Error('rpc down'))
    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(3),
    )
    expect(result).toHaveLength(3)
    for (const entry of result) {
      expect(entry.status).toBe('failure')
      if (entry.status === 'failure') {
        expect(entry.error.message).toBe('rpc down')
      }
    }
  })

  it('preserves peer chunk results when one chunk rejects', async () => {
    multicallMock.mockRejectedValueOnce(new Error('chunk 1 down'))
    multicallMock.mockResolvedValueOnce([ok(5000)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(5001),
    )

    expect(result).toHaveLength(5001)
    for (let i = 0; i < 5000; i++) {
      expect(result[i]?.status).toBe('failure')
    }
    expect(result[5000]?.status).toBe('success')
  })
})
