import type { HistoryEvent } from '@ens-apps/indexer/reads'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAddressHistory = vi.fn()
const listAddressNames = vi.fn()
vi.mock('@/lib/indexer', () => ({
  indexer: {
    getAddressHistory: (...args: unknown[]) =>
      ResultAsync.fromPromise(getAddressHistory(...args), (e) => e),
    getNamesForAddress: (...args: unknown[]) =>
      ResultAsync.fromPromise(listAddressNames(...args), (e) => e),
  },
}))

const {
  countWholeTransactions,
  getAddressHeldNamesQueryOptions,
  getAddressHistoryPagesQueryOptions,
  getAddressHistoryQueryOptions,
} = await import('./useAddressHistory')

const ADDRESS = '0x00000000000000000000000000000000000000Aa'

const row = (over: Partial<HistoryEvent>): HistoryEvent =>
  ({
    id: 'a'.repeat(64),
    type: 'transfer',
    name: 'held.eth',
    registrationId: '1',
    blockNumber: 100,
    timestamp: new Date(1_781_049_606_000),
    transactionHash: '0xabc',
    logIndex: 2,
    contractAddress: null,
    kind: 'TokenControlTransferred',
    data: { to: '0x00000000000000000000000000000000000000aa' },
    ...over,
  }) as HistoryEvent

const page = <T>(items: T[], next: string | null = null) => ({
  items,
  nextCursor: next,
  totalCount: items.length,
})

const read = (pageSize = 200) => {
  const { queryFn, queryKey } = getAddressHistoryQueryOptions({
    address: ADDRESS,
    pageSize,
  })
  return (queryFn as (context: unknown) => Promise<unknown>)({
    queryKey,
    signal: new AbortController().signal,
  } as unknown as QueryFunctionContext)
}

describe('getAddressHistoryQueryOptions', () => {
  beforeEach(() => {
    getAddressHistory.mockReset()
    listAddressNames.mockReset()
    listAddressNames.mockResolvedValue(
      page([{ name: 'held.eth', relations: ['owner', 'manager'] }]),
    )
  })

  it('reads one short page for the teaser, every relation with payloads', async () => {
    getAddressHistory.mockResolvedValue(page([]))
    await read(5)
    expect(getAddressHistory).toHaveBeenCalledWith(
      {
        address: ADDRESS.toLowerCase(),
        order: 'desc',
        pageSize: 5,
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(getAddressHistory).toHaveBeenCalledTimes(1)
  })

  it('groups by name, marking the names whose token the address holds', async () => {
    getAddressHistory.mockResolvedValue(
      page([
        row({}),
        row({ name: 'assigned.eth', logIndex: 3 }),
        row({
          name: '',
          type: 'record',
          logIndex: 4,
          data: { key: 'text:x' },
        }),
        row({ name: 'held.eth', transactionHash: null, type: 'release' }),
      ]),
    )

    const { history, heldNames } = (await read()) as {
      history: unknown
      heldNames: ReadonlySet<string>
    }
    expect(heldNames).toEqual(new Set(['held.eth']))
    expect(history).toEqual([
      {
        name: 'held.eth',
        registrarHolder: ADDRESS,
        events: [
          {
            id: '0xabc-2',
            transactionHash: '0xabc',
            blockNumber: 100,
            name: 'held.eth',
            type: 'TokenControlTransferred',
            timestamp: 1_781_049_606,
            data: { to: '0x00000000000000000000000000000000000000aa' },
          },
        ],
      },
      expect.objectContaining({ name: 'assigned.eth', registrarHolder: null }),
      expect.objectContaining({ name: null, registrarHolder: null }),
    ])
  })
})

describe('getAddressHistoryPagesQueryOptions', () => {
  beforeEach(() => getAddressHistory.mockReset())

  it('reads one page per call and hands back the cursor', async () => {
    getAddressHistory.mockResolvedValue(page([row({})], 'next'))
    const { queryFn, queryKey, getNextPageParam } =
      getAddressHistoryPagesQueryOptions({ address: ADDRESS })
    const result = (await (queryFn as (context: unknown) => Promise<unknown>)({
      queryKey,
      pageParam: 'c1',
    } as unknown as QueryFunctionContext)) as { nextCursor: string | null }
    expect(getAddressHistory).toHaveBeenCalledTimes(1)
    expect(getAddressHistory.mock.lastCall?.[0]).toMatchObject({
      pageSize: 100,
      cursor: 'c1',
    })
    expect(result.nextCursor).toBe('next')
    expect(getNextPageParam?.(result as never, [], undefined, [])).toBe('next')
  })
})

describe('getAddressHeldNamesQueryOptions', () => {
  it('reads every owned name past the default page limit', async () => {
    listAddressNames.mockReset()
    listAddressNames.mockImplementation(
      async ({ cursor }: { cursor?: string }) => {
        const offset = Number(cursor ?? 0)
        return page(
          Array.from({ length: 200 }, (_, i) => ({
            name: `name-${offset + i}.eth`,
            relations: ['owner'],
          })),
          offset + 200 < 1_000 ? String(offset + 200) : null,
        )
      },
    )
    const { queryFn, queryKey } = getAddressHeldNamesQueryOptions({
      address: ADDRESS,
    })
    const held = (await (queryFn as (context: unknown) => Promise<unknown>)({
      queryKey,
    } as unknown as QueryFunctionContext)) as ReadonlySet<string>
    expect(held.size).toBe(1_000)
    expect(listAddressNames).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ADDRESS,
        relations: ['owner'],
        pageSize: 200,
      }),
      expect.anything(),
    )
  })
})

describe('countWholeTransactions', () => {
  const tx = (hash: string, count: number) =>
    Array.from({ length: count }, () =>
      row({ transactionHash: hash as `0x${string}` }),
    )
  const rows = [...tx('0xa', 2), ...tx('0xb', 3), ...tx('0xc', 2)]

  it('takes the rest of a transaction the window cuts', () => {
    expect(countWholeTransactions(rows, 3, false)).toBe(5)
    expect(countWholeTransactions(rows, 2, false)).toBe(2)
  })

  it('holds back the last loaded transaction while more pages follow', () => {
    expect(countWholeTransactions(rows, 7, true)).toBe(5)
    expect(countWholeTransactions(rows, 7, false)).toBe(7)
  })

  it('shows one transaction larger than the read as it is', () => {
    expect(countWholeTransactions(tx('0xa', 4), 4, true)).toBe(4)
  })
})
