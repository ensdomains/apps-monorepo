import type { HistoryEvent } from '@ens-apps/indexer/reads'
import { okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getNameHistory = vi.fn()
const listEvents = vi.fn()
vi.mock('@/lib/indexer', () => ({
  indexer: {
    getNameHistory: (...args: unknown[]) =>
      ResultAsync.fromPromise(getNameHistory(...args), (e) => e),
    getEvents: (...args: unknown[]) =>
      ResultAsync.fromPromise(listEvents(...args), (e) => e),
  },
}))
// Which resolvers a name pointed at is covered in assignedResolvers.test.ts.
vi.mock('./assignedResolvers', () => ({
  dropUnassignedRecords: (rows: readonly unknown[]) => okAsync([...rows]),
}))

const { fetchContractEventsPage, fetchNameHistoryPage } = await import(
  './timelineEventPage'
)

const row = (over: Partial<HistoryEvent> = {}): HistoryEvent =>
  ({
    id: 'a'.repeat(64),
    type: 'record',
    name: 'alice.eth',
    registrationId: null,
    blockNumber: 100,
    timestamp: new Date(1_781_049_606_000),
    transactionHash: '0xabc',
    logIndex: 12,
    contractAddress: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
    kind: 'RecordChanged',
    data: { key: 'addr:60', coin_type: 60, value: '0x01' },
    ...over,
  }) as HistoryEvent

const page = (items: HistoryEvent[], over = {}) => ({
  items,
  nextCursor: 'next',
  totalCount: 7,
  ...over,
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

    expect(getNameHistory).toHaveBeenCalledWith(
      {
        name: 'alice.eth',
        includeChildRegistrations: false,
        types: ['resolver', 'record'],
        from: new Date(1_700_000_000_000),
        to: new Date(1_700_086_399_000),
        order: 'desc',
        pageSize: 100,
        cursor: 'c1',
      },
      expect.anything(),
    )
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
    expect(getNameHistory.mock.lastCall?.[0].includeChildRegistrations).toBe(
      true,
    )

    await fetchNameHistoryPage({ name: 'eth', includeChildRegistrations: true })
    expect(getNameHistory.mock.lastCall?.[0].includeChildRegistrations).toBe(
      false,
    )
  })

  it('does not ask the indexer for an empty type set', async () => {
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
            transactionHash: null,
            logIndex: null,
          }),
          row({ id: 'nowhere', blockNumber: null, timestamp: null }),
        ],
        { totalCount: null, nextCursor: null },
      ),
    )
    const result = (
      await fetchNameHistoryPage({ name: 'alice.eth' })
    )._unsafeUnwrap()
    expect(result.events.map((event) => event.id)).toEqual(['lapse'])
    expect(result.events[0].transactionHash).toBeNull()
    expect(result.totalCount).toBeUndefined()
  })

  it('reads a name the indexer has not indexed as an empty history', async () => {
    getNameHistory.mockResolvedValue(null)
    const result = await fetchNameHistoryPage({ name: 'jesse.base.eth' })
    expect(result._unsafeUnwrap()).toMatchObject({ events: [], totalCount: 0 })
  })

  it('fails when a later page finds the name no longer indexed', async () => {
    getNameHistory.mockResolvedValue(null)
    const result = await fetchNameHistoryPage({
      name: 'jesse.base.eth',
      cursor: 'c1',
    })
    expect(result.isErr()).toBe(true)
  })

  it('surfaces an indexer failure as an error result', async () => {
    getNameHistory.mockRejectedValue(new Error('stale'))
    const result = await fetchNameHistoryPage({ name: 'alice.eth' })
    expect(result.isErr()).toBe(true)
  })
})

describe('fetchContractEventsPage', () => {
  it('reads one contract’s events, newest first, with their exact total', async () => {
    listEvents.mockResolvedValue(page([row()], { totalCount: 13_587 }))
    const result = await fetchContractEventsPage({
      contractAddress: '0xABCdef0000000000000000000000000000000001',
      cursor: 'c2',
    })
    expect(listEvents).toHaveBeenCalledWith(
      {
        contractAddress: '0xabcdef0000000000000000000000000000000001',
        includeTotal: true,
        order: 'desc',
        pageSize: 100,
        cursor: 'c2',
      },
      expect.anything(),
    )
    expect(result._unsafeUnwrap().totalCount).toBe(13_587)
  })

  it('reads every registration in a registry feed as a subname', async () => {
    listEvents.mockResolvedValue(
      page([
        row({
          id: 'sub',
          type: 'registration',
          name: 'bob.alice.eth',
          data: {},
        }),
        row({ id: 'record' }),
      ]),
    )
    const result = (
      await fetchContractEventsPage({
        contractAddress: '0xabcdef0000000000000000000000000000000001',
      })
    )._unsafeUnwrap()
    expect(result.events.map((event) => event.subject)).toEqual([
      'child',
      undefined,
    ])
  })

  it('renders a migration row and a type newer than the client without failing', async () => {
    listEvents.mockResolvedValue(
      page(
        [
          row({
            id: 'migrated',
            type: 'migration',
            kind: 'MigrationApplied',
            data: { migration_path: 'unlocked_wrapped' },
          }),
          row({ id: 'future', type: 'future_type' as never, data: {} }),
        ],
        { nextCursor: null },
      ),
    )
    const result = (
      await fetchContractEventsPage({
        contractAddress: '0xabcdef0000000000000000000000000000000001',
      })
    )._unsafeUnwrap()
    expect(result.events.map((event) => event.type)).toEqual([
      'migration',
      'future_type',
    ])
  })
})
