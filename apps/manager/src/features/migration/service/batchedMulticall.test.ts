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
// biome-ignore lint/suspicious/noExplicitAny: test fixture only passed through
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

  it('issues a single multicall for exactly 500 contracts', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, i) => ok(i)),
    )
    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(500),
    )
    expect(multicallMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(500)
  })

  it('splits 501 contracts into two chunks of 500 and 1', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, i) => ok(i)),
    )
    multicallMock.mockResolvedValueOnce([ok(500)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(501),
    )

    expect(multicallMock).toHaveBeenCalledTimes(2)
    expect(multicallMock.mock.calls[0]![1]!.contracts).toHaveLength(500)
    expect(multicallMock.mock.calls[1]![1]!.contracts).toHaveLength(1)
    expect(result).toHaveLength(501)
  })

  it('splits 1001 contracts into three chunks: 500, 500, 1', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, i) => ok(i)),
    )
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, i) => ok(500 + i)),
    )
    multicallMock.mockResolvedValueOnce([ok(1000)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(1001),
    )

    expect(multicallMock).toHaveBeenCalledTimes(3)
    expect(multicallMock.mock.calls[0]![1]!.contracts).toHaveLength(500)
    expect(multicallMock.mock.calls[1]![1]!.contracts).toHaveLength(500)
    expect(multicallMock.mock.calls[2]![1]!.contracts).toHaveLength(1)
    expect(result).toHaveLength(1001)
  })

  it('preserves cross-chunk result ordering after flattening', async () => {
    multicallMock.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, i) => ok(i)),
    )
    multicallMock.mockResolvedValueOnce([ok(500), ok(501)])

    const result = await batchedMulticall<number>(
      publicClient,
      fakeContracts(502),
    )

    expect(
      result.map((r) => (r.status === 'success' ? r.result : null)),
    ).toEqual(Array.from({ length: 502 }, (_, i) => i))
  })

  it('always invokes multicall with allowFailure: true and batchSize: 0', async () => {
    multicallMock.mockResolvedValueOnce([ok(0)])
    await batchedMulticall<number>(publicClient, fakeContracts(1))
    const [, args] = multicallMock.mock.calls[0]!
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
    expect(result[1]!.status).toBe('failure')
    expect(result[0]!.status).toBe('success')
    expect(result[2]!.status).toBe('success')
  })

  it('propagates errors thrown by multicall', async () => {
    multicallMock.mockRejectedValueOnce(new Error('rpc down'))
    await expect(
      batchedMulticall<number>(publicClient, fakeContracts(1)),
    ).rejects.toThrow('rpc down')
  })
})
