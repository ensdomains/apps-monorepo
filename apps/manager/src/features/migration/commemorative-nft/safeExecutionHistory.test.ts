import type { Address, Hex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  createSafeExecutionPublicClient,
  SAFE_WALLET_CONNECTOR,
} from '@/test-utils/safeWallet.fixture'
import { readHistoricalCommemorativeNftSafeExecution } from './safeExecutionHistory'

const ownerAddress: Address = '0x1111111111111111111111111111111111111111'
const safeTxHash: Hex = `0x${'a'.repeat(64)}`
const executionHash: Hex = `0x${'b'.repeat(64)}`
const deferred = <T>() => {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  if (!resolve) throw new Error('Deferred resolver was not initialized')
  return { promise, resolve }
}
const makeClient = (
  overrides: Partial<
    Parameters<typeof createSafeExecutionPublicClient>[0]
  > = {},
) =>
  createSafeExecutionPublicClient({
    ownerAddress,
    safeTxHash,
    executionHash,
    event: 'ExecutionFailure',
    latestBlockNumber: 1_000_000n,
    hasExecution: false,
    ...overrides,
  })
const read = (
  publicClient: ReturnType<typeof makeClient>,
  overrides: Partial<
    Parameters<typeof readHistoricalCommemorativeNftSafeExecution>[0]
  > = {},
) =>
  readHistoricalCommemorativeNftSafeExecution({
    publicClient,
    ownerAddress,
    safeTxHash,
    connector: SAFE_WALLET_CONNECTOR,
    signal: new AbortController().signal,
    ...overrides,
  })

describe('commemorative NFT Safe execution history reads', () => {
  it('commits only successful contiguous pages when a later history read is unavailable', async () => {
    const onHistoryProgress = vi.fn()
    const onLogRange = vi.fn(
      ({ fromBlock }: { readonly fromBlock: bigint }) => {
        if (fromBlock === 10_000n) throw new Error('RPC unavailable')
      },
    )
    await expect(
      read(makeClient({ onLogRange }), { onHistoryProgress }),
    ).rejects.toThrow()
    expect(onHistoryProgress.mock.calls).toEqual([[9_900n]])
    expect(onLogRange).toHaveBeenCalledTimes(3)
  })

  it('resumes a persisted legacy cursor without repeating genesis', async () => {
    const onLogRange = vi.fn()
    await expect(
      read(
        makeClient({
          onLogRange,
          hasExecution: true,
          executionBlockNumber: 12_000n,
        }),
        { searchFromBlock: 9_900n },
      ),
    ).resolves.toEqual({ transactionHash: executionHash, isSuccess: false })
    expect(onLogRange.mock.calls).toEqual([
      [{ fromBlock: 990_001n, toBlock: 1_000_000n }],
      [{ fromBlock: 9_900n, toBlock: 19_899n }],
    ])
  })

  it('keeps an empty bounded search undecided while reporting progress', async () => {
    const onLogRange = vi.fn()
    const onHistoryProgress = vi.fn()
    await expect(
      read(makeClient({ onLogRange }), { onHistoryProgress }),
    ).resolves.toBeUndefined()
    expect(onLogRange).toHaveBeenCalledTimes(24)
    expect(onHistoryProgress).toHaveBeenLastCalledWith(229_900n)
  })

  it('does not commit progress from a log read that completes after cancellation', async () => {
    const publicClient = makeClient({ latestBlockNumber: 100n })
    const logs = deferred<Awaited<ReturnType<typeof publicClient.getLogs>>>()
    const getLogs = vi
      .spyOn(publicClient, 'getLogs')
      .mockReturnValueOnce(logs.promise)
    const onHistoryProgress = vi.fn()
    const controller = new AbortController()
    const stopped = new Error('History check stopped')
    const reading = read(publicClient, {
      onHistoryProgress,
      signal: controller.signal,
    })
    const rejection = expect(reading).rejects.toBe(stopped)
    await vi.waitFor(() => expect(getLogs).toHaveBeenCalledTimes(1))
    controller.abort(stopped)
    logs.resolve([])
    await rejection
    expect(onHistoryProgress).not.toHaveBeenCalled()
  })
})
