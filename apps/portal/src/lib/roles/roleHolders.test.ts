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
const { INDEXED_ROLES_TIMEOUT_MS } = await import('./indexedRoles')

const row = (account: string, roleBitmap = '0x5', blockNumber = 1) => ({
  account,
  roleBitmap,
  blockNumber,
})

const indexedPage = (rows: readonly unknown[], hasNextPage = false) => ({
  roleConnection: {
    pageInfo: { hasNextPage },
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
    })
  })

  it('returns each account checksummed with its current bitmap', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row(ACCOUNT.toLowerCase(), '0x11'), row(OTHER, '0x1')]),
    )

    expect((await run())._unsafeUnwrap()).toMatchObject([
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
      await vi.advanceTimersByTimeAsync(INDEXED_ROLES_TIMEOUT_MS)

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

  it('fails when the response has no assignments field', async () => {
    mockGraphqlRequest.mockResolvedValue({})

    expect((await run()).isErr()).toBe(true)
  })

  it('fails when there are more holders than one request returns, rather than drop any', async () => {
    mockGraphqlRequest.mockResolvedValue(indexedPage([row(ACCOUNT)], true))

    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      reason: 'truncated',
    })
  })
})
