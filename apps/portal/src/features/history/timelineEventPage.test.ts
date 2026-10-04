import type { HistoryEvent } from '@ens-apps/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getNameHistory = vi.fn()
const listEvents = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getNameHistory, listEvents } }))

const { fetchContractEventsPage, fetchNameHistoryPage } = await import(
  './timelineEventPage'
)

const row = (over: Partial<HistoryEvent> = {}): HistoryEvent =>
  ({
    id: 'a'.repeat(64),
    type: 'record',
    name: 'alice.eth',
    namespace: 'ens',
    registration_id: null,
    block_number: 100,
    timestamp: '2026-06-10T00:00:06Z',
    transaction_hash: '0xabc',
    log_index: 12,
    contract_address: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
    kind: 'RecordChanged',
    data: { key: 'addr:60', coin_type: 60, value: '0x01' },
    ...over,
  }) as HistoryEvent

const page = (data: HistoryEvent[], over = {}) => ({
  data,
  page: {
    cursor: null,
    next_cursor: 'next',
    page_size: 100,
    total_count: 7,
    has_more: true,
    ...over,
  },
  meta: {},
})

describe('fetchNameHistoryPage', () => {
  beforeEach(() => {
    getNameHistory.mockReset()
    getNameHistory.mockResolvedValue(page([row()]))
  })

  it('reads the normalized name with payloads, filters and the cursor', async () => {
    const result = await fetchNameHistoryPage({
      name: 'Alice.eth',
      types: ['resolver', 'record'],
      from: 1_700_000_000,
      to: 1_700_086_399,
      cursor: 'c1',
    })

    expect(getNameHistory).toHaveBeenCalledWith('alice.eth', {
      include: ['data', 'raw'],
      type: ['resolver', 'record'],
      from_timestamp: '2023-11-14T22:13:20Z',
      to_timestamp: '2023-11-15T22:13:19Z',
      order: 'desc',
      page_size: 100,
      cursor: 'c1',
    })
    expect(result._unsafeUnwrap()).toMatchObject({
      endCursor: 'next',
      hasNextPage: true,
      totalCount: 7,
      events: [
        {
          type: 'record',
          kind: 'RecordChanged',
          transactionHash: '0xabc',
          blockNumber: 100,
          timestamp: 1_781_049_606,
          contractAddress: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
          data: { key: 'addr:60', coin_type: 60, value: '0x01' },
        },
      ],
    })
  })

  it('asks for child registrations, except on eth and base.eth', async () => {
    await fetchNameHistoryPage({
      name: 'alice.eth',
      includeChildRegistrations: true,
    })
    expect(getNameHistory.mock.lastCall?.[1].include).toEqual([
      'data',
      'raw',
      'child_registrations',
    ])

    await fetchNameHistoryPage({ name: 'eth', includeChildRegistrations: true })
    expect(getNameHistory.mock.lastCall?.[1].include).toEqual(['data', 'raw'])
  })

  it('does not ask bigname for an empty type set', async () => {
    const result = await fetchNameHistoryPage({ name: 'alice.eth', types: [] })
    expect(getNameHistory).not.toHaveBeenCalled()
    expect(result._unsafeUnwrap()).toMatchObject({
      events: [],
      hasNextPage: false,
    })
  })

  it('keeps a state-derived row without a transaction, drops one with no position', async () => {
    getNameHistory.mockResolvedValue(
      page(
        [
          row({
            id: 'lapse',
            type: 'release',
            transaction_hash: null,
            log_index: null,
          }),
          row({ id: 'nowhere', block_number: null, timestamp: null }),
        ],
        { total_count: null, has_more: false, next_cursor: null },
      ),
    )
    const result = (
      await fetchNameHistoryPage({ name: 'alice.eth' })
    )._unsafeUnwrap()
    expect(result.events.map((event) => event.id)).toEqual(['lapse'])
    expect(result.events[0].transactionHash).toBeNull()
    expect(result.totalCount).toBeUndefined()
  })

  it('surfaces a bigname failure as an error result', async () => {
    getNameHistory.mockRejectedValue(new Error('stale'))
    const result = await fetchNameHistoryPage({ name: 'alice.eth' })
    expect(result.isErr()).toBe(true)
  })
})

describe('fetchContractEventsPage', () => {
  it('reads one contract’s events, newest first', async () => {
    listEvents.mockResolvedValue(page([row()], { total_count: null }))
    await fetchContractEventsPage({
      contractAddress: '0xABCdef0000000000000000000000000000000001',
      cursor: 'c2',
    })
    expect(listEvents).toHaveBeenCalledWith({
      contract_address: '0xabcdef0000000000000000000000000000000001',
      include: ['data', 'raw'],
      order: 'desc',
      page_size: 100,
      cursor: 'c2',
    })
  })
})
