import { ok } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = getAddress(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
)
const OTHER: Address = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

const mockGetLogs = vi.fn()
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

const { getRoleHolders } = await import('./roleHolders')
const { INDEXED_ROLE_EVENTS_TIMEOUT_MS } = await import('./roleChangeLogs')

const row = (account: string, roleBitmap = '0x5', blockNumber = 1) => ({
  account,
  roleBitmap,
  blockNumber,
})

/** One page of the indexer's role assignments; `endCursor` set means more follow. */
const indexedPage = (
  rows: readonly unknown[],
  endCursor: string | null = null,
) => ({
  roleConnection: {
    pageInfo: { hasNextPage: endCursor !== null, endCursor },
    edges: rows.map((node) => ({ node })),
  },
})

const nodeLog = (block: bigint, account: Address, newRoleBitmap: bigint) => ({
  blockNumber: block,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  args: { resource: 0n, account, oldRoleBitmap: 0n, newRoleBitmap },
})

const run = (resource = 0n) =>
  getRoleHolders({ registryAddress: REGISTRY, resource })

describe('getRoleHolders', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
  })

  it('asks the indexer for the registry and padded resource, and reads no logs', async () => {
    mockGraphqlRequest.mockResolvedValue(indexedPage([]))

    await run(0x1234n)

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      contract: REGISTRY.toLowerCase(),
      resource: `0x${'1234'.padStart(64, '0')}`,
      first: 1000,
      after: undefined,
    })
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('returns each account checksummed with its current bitmap', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row(ACCOUNT.toLowerCase(), '0x11'), row(OTHER, '0x1')]),
    )

    expect((await run())._unsafeUnwrap()).toEqual([
      { account: ACCOUNT, roleBitmap: 0x11n },
      { account: OTHER, roleBitmap: 0x1n },
    ])
  })

  it('lists the oldest assignment first, whatever order the indexer sends', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row(OTHER, '0x1', 20), row(ACCOUNT, '0x1', 10)]),
    )

    const holders = (await run())._unsafeUnwrap()

    expect(holders.map(({ account }) => account)).toEqual([ACCOUNT, OTHER])
  })

  it('follows the cursor through every page', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(indexedPage([row(ACCOUNT)], 'c1'))
      .mockResolvedValueOnce(indexedPage([row(OTHER)]))

    const holders = (await run())._unsafeUnwrap()

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({
      after: 'c1',
    })
    expect(holders.map(({ account }) => account)).toEqual([ACCOUNT, OTHER])
  })

  it('falls back to replaying node logs when the indexer fails, keeping each account’s last bitmap', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer down'))
    mockGetLogs.mockResolvedValue([
      nodeLog(1n, ACCOUNT, 0x1n),
      nodeLog(2n, OTHER, 0x5n),
      nodeLog(3n, ACCOUNT, 0x0n),
    ])

    expect((await run())._unsafeUnwrap()).toEqual([
      { account: ACCOUNT, roleBitmap: 0x0n },
      { account: OTHER, roleBitmap: 0x5n },
    ])
    // Straight to the node: the indexed event feed is not tried in between.
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1)
  })

  it('falls back to the node when the indexer stalls', async () => {
    vi.useFakeTimers()
    try {
      mockGraphqlRequest.mockReturnValue(new Promise(() => {}))
      mockGetLogs.mockResolvedValue([nodeLog(1n, ACCOUNT, 0x1n)])

      const pending = run()
      await vi.advanceTimersByTimeAsync(INDEXED_ROLE_EVENTS_TIMEOUT_MS)

      expect((await pending)._unsafeUnwrap()).toEqual([
        { account: ACCOUNT, roleBitmap: 0x1n },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the node when a row will not decode', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([{ account: ACCOUNT, roleBitmap: 5, blockNumber: 1 }]),
    )

    await run()

    expect(mockGetLogs).toHaveBeenCalledTimes(1)
  })

  it('falls back to the node when more pages are promised without a cursor', async () => {
    mockGraphqlRequest.mockResolvedValue({
      roleConnection: {
        pageInfo: { hasNextPage: true, endCursor: null },
        edges: [{ node: row(ACCOUNT) }],
      },
    })

    await run()

    expect(mockGetLogs).toHaveBeenCalledTimes(1)
  })

  it('falls back to the node when the response has no assignments field', async () => {
    mockGraphqlRequest.mockResolvedValue({})

    await run()

    expect(mockGetLogs).toHaveBeenCalledTimes(1)
  })
})
