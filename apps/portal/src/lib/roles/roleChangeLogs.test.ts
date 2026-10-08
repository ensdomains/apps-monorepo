import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from './rolesFromBlock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FROM_BLOCK = 9_782_822n

const mockGraphqlRequest = vi.fn()

vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

const {
  getRoleChangeLogs,
  INDEXED_ROLE_EVENTS_TIMEOUT_MS,
  ROOT_RESOURCE,
  toRoleHistoryEntries,
} = await import('./roleChangeLogs')

const ROOT_HEX = `0x${'0'.repeat(64)}`

/** One page of the indexer's event feed; `endCursor` set means more follow. */
const indexedPage = (
  rows: readonly unknown[],
  endCursor: string | null = null,
) => ({
  eventConnection: {
    pageInfo: { hasNextPage: endCursor !== null, endCursor },
    edges: rows.map((node) => ({ node })),
  },
})

const row = ({
  block,
  account = ACCOUNT,
  newRoleBitmap = '0x1',
}: {
  readonly block: number
  readonly account?: string
  readonly newRoleBitmap?: string
}) => ({
  blockNumber: block,
  timestamp: block * 12,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  asEACRolesChanged: {
    resource: ROOT_HEX,
    account,
    oldRoleBitmap: '0x0',
    newRoleBitmap,
  },
})

const run = (params: Partial<Parameters<typeof getRoleChangeLogs>[0]> = {}) =>
  getRoleChangeLogs({
    registryAddress: REGISTRY,
    resource: ROOT_RESOURCE,
    ...params,
  })

describe('getRoleChangeLogs', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue(indexedPage([]))
  })

  it('asks the indexer for the registry and padded resource, version bits included', async () => {
    await run({ resource: 0x1234_0000_0001n })

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      contractAddress: REGISTRY.toLowerCase(),
      resource: `0x${'123400000001'.padStart(64, '0')}`,
      fromBlock: Number(ROLES_FROM_BLOCK),
      first: 1000,
      after: undefined,
    })
  })

  it('applies the caller’s lower bound', async () => {
    await run({ fromBlock: FROM_BLOCK })

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fromBlock: Number(FROM_BLOCK) }),
    )
  })

  it('maps rows to logs, checksummed and with a timestamp', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row({ block: 10, account: ACCOUNT.toLowerCase() })]),
    )

    expect((await run())._unsafeUnwrap()).toEqual([
      {
        blockNumber: 10n,
        transactionHash: `0x${'a'.padStart(64, '0')}`,
        timestamp: 120n,
        args: {
          resource: 0n,
          account: getAddress(ACCOUNT),
          oldRoleBitmap: 0n,
          newRoleBitmap: 1n,
        },
      },
    ])
  })

  // The indexer cannot filter on the changed account, so it happens here.
  it('narrows to one account when asked', async () => {
    const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([
        row({ block: 10, account: ACCOUNT }),
        row({ block: 11, account: OTHER }),
      ]),
    )

    const logs = (await run({ account: ACCOUNT }))._unsafeUnwrap()

    expect(logs.map((log) => log.blockNumber)).toEqual([10n])
  })

  it('follows the cursor through every page, keeping rows oldest first', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(
        indexedPage(
          Array.from({ length: 1000 }, (_, i) => row({ block: i + 1 })),
          'c1',
        ),
      )
      .mockResolvedValueOnce(indexedPage([row({ block: 1001 })]))

    const logs = (await run())._unsafeUnwrap()

    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({
      after: 'c1',
    })
    expect(logs).toHaveLength(1001)
    expect(logs.at(0)?.blockNumber).toBe(1n)
    expect(logs.at(-1)?.blockNumber).toBe(1001n)
  })

  it('fails when the indexer fails', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer down'))

    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      _tag: 'GetRoleChangeLogsError',
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

  it('fails when a later page fails, rather than return a partial history', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(indexedPage([row({ block: 1 })], 'c1'))
      .mockRejectedValueOnce(new Error('indexer down'))

    expect((await run()).isErr()).toBe(true)
  })

  it('fails when the history runs past the page budget', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row({ block: 1 })], 'more'),
    )

    expect((await run())._unsafeUnwrapErr()).toMatchObject({
      reason: 'truncated',
    })
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(20)
  })

  it('fails when more pages are promised without a cursor', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eventConnection: {
        pageInfo: { hasNextPage: true, endCursor: null },
        edges: [{ node: row({ block: 1 }) }],
      },
    })

    expect((await run()).isErr()).toBe(true)
  })

  it('fails when the response has no event feed', async () => {
    mockGraphqlRequest.mockResolvedValue({})

    expect((await run()).isErr()).toBe(true)
  })

  // A row that will not decode is a read to distrust, not a value to guess at.
  it('fails when a row will not decode', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([{ ...row({ block: 10 }), blockNumber: 'ten' }]),
    )

    expect((await run()).isErr()).toBe(true)
  })
})

describe('toRoleHistoryEntries', () => {
  const log = (block: bigint, newRoleBitmap = 1n) => ({
    blockNumber: block,
    timestamp: block * 12n,
    transactionHash: `0x${block.toString(16).padStart(64, '0')}` as const,
    args: {
      resource: 0x1234n,
      account: getAddress(ACCOUNT),
      oldRoleBitmap: 0n,
      newRoleBitmap,
    },
  })

  it('carries the indexed timestamp and the resource as padded hex', () => {
    const [entry] = toRoleHistoryEntries({
      logs: [log(10n)],
      resource: 0x1234n,
    })

    expect(entry?.timestamp).toBe(120n)
    expect(entry?.resource).toBe(`0x${'1234'.padStart(64, '0')}`)
  })

  it('returns the newest change first', () => {
    const entries = toRoleHistoryEntries({
      logs: [log(10n), log(30n), log(20n)],
      resource: 0x1234n,
    })

    expect(entries.map((entry) => entry.blockNumber)).toEqual([30n, 20n, 10n])
  })
})
