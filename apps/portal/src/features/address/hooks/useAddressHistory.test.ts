import type { HistoryEvent } from '@ens-apps/bigname'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAddressHistory = vi.fn()
const listAddressNames = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: { getAddressHistory, listAddressNames },
}))

const { getAddressHistoryQueryOptions } = await import('./useAddressHistory')

const ADDRESS = '0x00000000000000000000000000000000000000Aa'

const row = (over: Partial<HistoryEvent>): HistoryEvent =>
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
  }) as HistoryEvent

const page = <T>(data: T[]) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 200,
    total_count: data.length,
    has_more: false,
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
      page([
        { name: 'held.eth', relations: ['owner', 'manager'] },
        // A token transferred without `reclaim`: the old holder is manager only.
        { name: 'assigned.eth', relations: ['manager'] },
      ]),
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
      cursor: undefined,
    })
    expect(listAddressNames).toHaveBeenCalledWith(ADDRESS.toLowerCase(), {
      relation: 'any',
      page_size: 200,
      cursor: undefined,
    })
  })

  it('reads one short page for the teaser', async () => {
    getAddressHistory.mockResolvedValue(page([]))
    await read(5)
    expect(getAddressHistory.mock.lastCall?.[1]).toMatchObject({ page_size: 5 })
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
