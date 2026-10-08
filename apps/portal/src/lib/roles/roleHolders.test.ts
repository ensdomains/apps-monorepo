import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = getAddress(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
)
const OTHER: Address = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

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

const run = (resource = 0n) =>
  getRoleHolders({ registryAddress: REGISTRY, resource })

describe('getRoleHolders', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  it('asks the indexer for the registry and padded resource', async () => {
    mockGraphqlRequest.mockResolvedValue(indexedPage([]))

    await run(0x1234n)

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      contract: REGISTRY.toLowerCase(),
      resource: `0x${'1234'.padStart(64, '0')}`,
      first: 1000,
      after: undefined,
    })
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

  it('fails when the indexer fails', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer down'))

    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'GetRoleHoldersError',
      reason: 'failed',
    })
  })

  it('fails when the indexer stalls', async () => {
    vi.useFakeTimers()
    try {
      mockGraphqlRequest.mockReturnValue(new Promise(() => {}))

      const pending = run()
      await vi.advanceTimersByTimeAsync(INDEXED_ROLE_EVENTS_TIMEOUT_MS)

      expect((await pending)._unsafeUnwrapErr()).toMatchObject({
        reason: 'timeout',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails when a row will not decode, rather than list a wrong holder', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([{ account: ACCOUNT, roleBitmap: 5, blockNumber: 1 }]),
    )

    expect((await run()).isErr()).toBe(true)
  })

  it('fails when more pages are promised without a cursor', async () => {
    mockGraphqlRequest.mockResolvedValue({
      roleConnection: {
        pageInfo: { hasNextPage: true, endCursor: null },
        edges: [{ node: row(ACCOUNT) }],
      },
    })

    expect((await run()).isErr()).toBe(true)
  })

  it('fails when the response has no assignments field', async () => {
    mockGraphqlRequest.mockResolvedValue({})

    expect((await run()).isErr()).toBe(true)
  })

  it('fails when the list runs past the page budget', async () => {
    mockGraphqlRequest.mockResolvedValue(indexedPage([row(ACCOUNT)], 'more'))

    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      reason: 'truncated',
    })
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(20)
  })
})
