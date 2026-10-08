import { ok, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

const getStatus = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    status: () => ResultAsync.fromPromise(getStatus(), (e) => e),
  },
}))

const getBlockNumber = vi.fn()
vi.mock('viem/actions', () => ({
  getBlockNumber: (...args: unknown[]) => getBlockNumber(...args),
}))

const safeGetClient = vi.fn(() => ok({}))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => safeGetClient(),
}))

const { sleep } = await import('@ens-apps/utils/sleep')
const { DEFAULT_INDEXER_SYNC_CONFIG, pollForIndexerSync } = await import(
  './pollForIndexerSync'
)

const status = (indexedBlock: number | null, chainId = '11155111') => ({
  data: {
    status: 'ready',
    pending_invalidation_count: 0,
    pending_invalidation_count_capped: false,
    dead_letter_count: 0,
    chains: { [chainId]: { indexed_block: indexedBlock } },
  },
  meta: {},
})

describe('pollForIndexerSync', () => {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    getStatus.mockReset()
    getBlockNumber.mockReset()
  })

  it('checks status every 2s for up to a minute by default', () => {
    expect(DEFAULT_INDEXER_SYNC_CONFIG).toEqual({
      initialDelay: 1000,
      retryInterval: 2000,
      maxAttempts: 30,
      maxWait: 60_000,
    })
  })

  it('stops at the deadline when status checks are slow', async () => {
    let now = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    getStatus.mockImplementation(async () => {
      now += 15_000
      return status(1)
    })

    await pollForIndexerSync({ invalidateQueries, blockNumber: 100n })

    expect(getStatus).toHaveBeenCalledTimes(4)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    clock.mockRestore()
  })

  it('invalidates once, as soon as the write block is indexed', async () => {
    getStatus
      .mockResolvedValueOnce(status(99))
      .mockResolvedValueOnce(status(100))

    await pollForIndexerSync({ invalidateQueries, blockNumber: 100n })

    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(getBlockNumber).not.toHaveBeenCalled()
    expect(vi.mocked(sleep).mock.calls).toEqual([
      [DEFAULT_INDEXER_SYNC_CONFIG.initialDelay],
      [DEFAULT_INDEXER_SYNC_CONFIG.retryInterval],
    ])
  })

  it('waits for the chain head when no block is given', async () => {
    getBlockNumber.mockResolvedValue(200n)
    getStatus
      .mockResolvedValueOnce(status(150))
      .mockResolvedValueOnce(status(201))

    await pollForIndexerSync({ invalidateQueries })

    expect(getBlockNumber).toHaveBeenCalledTimes(1)
    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('invalidates anyway once the checks run out', async () => {
    getStatus.mockResolvedValue(status(1))

    await pollForIndexerSync({
      invalidateQueries,
      blockNumber: 100,
      config: { maxAttempts: 3 },
    })

    expect(getStatus).toHaveBeenCalledTimes(3)
    // Initial delay plus two intervals: none after the last check.
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting through status errors and other chains', async () => {
    getStatus
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(status(500, '1'))
      .mockResolvedValueOnce(status(null))
      .mockResolvedValueOnce(status(100))

    await pollForIndexerSync({ invalidateQueries, blockNumber: 100n })

    expect(getStatus).toHaveBeenCalledTimes(4)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('invalidates straight away when the target block cannot be read', async () => {
    getBlockNumber.mockRejectedValue(new Error('rpc down'))

    await pollForIndexerSync({ invalidateQueries })

    expect(getStatus).not.toHaveBeenCalled()
    expect(sleep).not.toHaveBeenCalled()
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('reports each status check', async () => {
    const onAttempt = vi.fn()
    getStatus.mockResolvedValueOnce(status(0)).mockResolvedValueOnce(status(5))

    await pollForIndexerSync({
      invalidateQueries,
      blockNumber: 5,
      onAttempt,
      config: { maxAttempts: 4 },
    })

    expect(onAttempt.mock.calls).toEqual([
      [1, 4],
      [2, 4],
    ])
  })

  it('propagates invalidateQueries errors', async () => {
    getStatus.mockResolvedValue(status(100))
    invalidateQueries.mockRejectedValueOnce(new Error('invalidation failed'))

    await expect(
      pollForIndexerSync({ invalidateQueries, blockNumber: 1 }),
    ).rejects.toThrow('invalidation failed')
  })
})
