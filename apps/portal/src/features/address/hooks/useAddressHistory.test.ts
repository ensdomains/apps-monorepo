import type { NameHistoryRow } from '@ens-apps/indexer/bigname'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAddressHistory = vi.fn()
const listAddressNames = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    addressHistory: (...args: unknown[]) =>
      ResultAsync.fromPromise(getAddressHistory(...args), (e) => e),
    addressNames: (...args: unknown[]) =>
      ResultAsync.fromPromise(listAddressNames(...args), (e) => e),
  },
}))

const { getAddressHistoryQueryOptions } = await import('./useAddressHistory')

const ADDRESS = '0x00000000000000000000000000000000000000Aa'

const row = (over: Partial<NameHistoryRow>): NameHistoryRow =>
  ({
    id: 'a'.repeat(64),
    type: 'transfer',
    name: 'held.eth',
    namespace: 'ens',
    registration_id: '1',
    block_number: 100,
    timestamp: '1781049606',
    transaction_hash: '0xabc',
    log_index: 2,
    kind: 'TokenControlTransferred',
    data: { to: '0x00000000000000000000000000000000000000aa' },
    ...over,
  }) as NameHistoryRow

const page = <T>(data: T[], next: string | null = null) => ({
  data,
  page: {
    cursor: null,
    next_cursor: next,
    page_size: 200,
    total_count: data.length,
    has_more: next !== null,
  },
  meta: {},
})

const read = (pageSize?: number) => {
  const { queryFn, queryKey } = getAddressHistoryQueryOptions({
    address: ADDRESS,
    pageSize,
  })
  return (queryFn as (context: unknown) => Promise<unknown>)({
    queryKey,
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

  it('reads every relation in one stream, with payloads', async () => {
    getAddressHistory.mockResolvedValue(page([]))
    await read()
    expect(getAddressHistory).toHaveBeenCalledWith(ADDRESS.toLowerCase(), {
      relation: 'any',
      include: ['data', 'raw'],
      order: 'desc',
      page_size: 200,
    })
    expect(listAddressNames).toHaveBeenCalledWith(
      ADDRESS,
      expect.objectContaining({ relation: ['owner'], page_size: 200 }),
    )
  })

  it('reads one short page for the teaser', async () => {
    getAddressHistory.mockResolvedValue(page([]))
    await read(5)
    expect(getAddressHistory.mock.lastCall?.[1]).toMatchObject({ page_size: 5 })
  })

  it('reads history and ownership past the old row caps and the default page limit', async () => {
    const total = 20_200
    getAddressHistory.mockImplementation(
      async (_address, { cursor }: { cursor?: string }) => {
        const offset = Number(cursor ?? 0)
        return page(
          Array.from({ length: 200 }, (_, i) =>
            row({
              name: `name-${offset + i}.eth`,
              log_index: offset + i,
            }),
          ),
          offset + 200 < total ? String(offset + 200) : null,
        )
      },
    )
    listAddressNames.mockImplementation(
      async (_address, { cursor }: { cursor?: string }) => {
        const offset = Number(cursor ?? 0)
        return page(
          Array.from({ length: 200 }, (_, i) => ({
            name: `name-${offset + i}.eth`,
            relations: ['owner'],
          })),
          offset + 200 < total ? String(offset + 200) : null,
        )
      },
    )

    const names = await read()
    expect(names).toHaveLength(total)
    expect(names).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'name-20199.eth',
          registrarHolder: ADDRESS,
        }),
      ]),
    )
    expect(getAddressHistory).toHaveBeenCalledTimes(101)
    expect(listAddressNames).toHaveBeenCalledTimes(101)
  })

  it('groups by name, marking the names whose token the address holds', async () => {
    getAddressHistory.mockResolvedValue(
      page([
        row({}),
        row({ name: 'assigned.eth', log_index: 3 }),
        row({
          name: '',
          type: 'record',
          log_index: 4,
          data: { key: 'text:x' },
        }),
        row({ name: 'held.eth', transaction_hash: null, type: 'release' }),
      ]),
    )

    expect(await read()).toEqual([
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
