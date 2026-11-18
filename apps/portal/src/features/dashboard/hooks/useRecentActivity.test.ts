import type { HistoryEvent } from '@ens-apps/indexer/reads'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listEvents = vi.fn()
vi.mock('@/lib/indexer', () => ({
  indexer: {
    getEvents: (...args: unknown[]) =>
      ResultAsync.fromPromise(listEvents(...args), (e) => e),
  },
}))
// Which resolvers a name pointed at is covered in assignedResolvers.test.ts.
vi.mock('@/features/history/assignedResolvers', () => ({
  dropUnassignedRecords: (rows: readonly unknown[]) => okAsync([...rows]),
}))

const { getRecentActivityQueryOptions } = await import('./useRecentActivity')

const row = (over: Partial<HistoryEvent>): HistoryEvent =>
  ({
    id: 'a'.repeat(64),
    type: 'record',
    name: 'alice.eth',
    registrationId: null,
    blockNumber: 100,
    timestamp: new Date(1_781_049_606_000),
    transactionHash: '0xabc',
    logIndex: 1,
    contractAddress: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
    kind: null,
    data: {},
    ...over,
  }) as HistoryEvent

const fetchPage = async (rows: HistoryEvent[]) => {
  listEvents.mockResolvedValue({
    items: rows,
    nextCursor: 'next',
    totalCount: null,
  })
  const { queryFn } = getRecentActivityQueryOptions()
  return (queryFn as (context: unknown) => Promise<unknown>)({
    pageParam: undefined,
  } as unknown as QueryFunctionContext)
}

describe('getRecentActivityQueryOptions', () => {
  beforeEach(() => listEvents.mockReset())

  it('reads the newest page of events across the namespace', async () => {
    const page = await fetchPage([])
    expect(listEvents).toHaveBeenCalledWith({
      order: 'desc',
      pageSize: 15,
      cursor: undefined,
    })
    expect(page).toEqual({ events: [], endCursor: 'next', hasNextPage: true })
  })

  it('carries each row by its friendly type, raw kind and typed payload', async () => {
    const page = (await fetchPage([
      row({
        type: 'registration',
        kind: 'RegistrationGranted',
        data: { registrant: '0x1111111111111111111111111111111111111111' },
      }),
      row({ type: 'record', data: { key: 'text:url', value: 'x' } }),
      // The indexer serves a row bigname sent without a payload with `{}`.
      row({ type: 'renewal', data: {} }),
    ])) as { events: { type: string; kind?: string; data: unknown }[] }

    expect(
      page.events.map(({ type, kind, data }) => [type, kind, data]),
    ).toEqual([
      [
        'registration',
        'RegistrationGranted',
        { registrant: '0x1111111111111111111111111111111111111111' },
      ],
      ['record', undefined, { key: 'text:url', value: 'x' }],
      ['renewal', undefined, {}],
    ])
  })

  it('keeps a row with no name, and drops one with no transaction', async () => {
    const page = (await fetchPage([
      row({ id: 'unattributed', name: '' }),
      row({ id: 'lapse', type: 'release', transactionHash: null }),
    ])) as { events: { name: string | null }[] }

    expect(page.events).toHaveLength(1)
    expect(page.events[0]).toMatchObject({ name: null })
  })

  it('skips the reverse name record a primary name change writes', async () => {
    const page = (await fetchPage([
      row({ id: 'primary', type: 'primary_name', data: { name: 'nitro.eth' } }),
      row({ id: 'record', type: 'record', data: { key: 'name' } }),
    ])) as { events: { type: string }[] }

    expect(page.events.map(({ type }) => type)).toEqual(['primary_name'])
  })

  it('keeps a name record written without a primary name change', async () => {
    const page = (await fetchPage([
      row({ id: 'primary', type: 'primary_name', data: { name: 'nitro.eth' } }),
      row({
        id: 'direct',
        type: 'record',
        transactionHash: '0xdef',
        data: { key: 'name' },
      }),
    ])) as { events: { type: string }[] }

    expect(page.events.map(({ type }) => type)).toEqual([
      'primary_name',
      'record',
    ])
  })

  it('counts a registration once and skips an authority row with no owner', async () => {
    const action_id = 'c'.repeat(64)
    const page = (await fetchPage([
      row({
        id: 'linked',
        type: 'registration',
        registrationId: 'r1',
        data: { action_id, action_role: 'linked' },
      }),
      row({
        id: 'registered',
        type: 'registration',
        data: { action_id, action_role: 'registered' },
      }),
      row({
        id: 'epoch',
        type: 'authority',
        data: { action: 'authority_changed' },
      }),
      row({
        id: 'wrap',
        type: 'authority',
        data: { action: 'name_wrapped' },
      }),
    ])) as { events: { type: string; data?: { action_role?: string } }[] }

    expect(page.events.map(({ type }) => type)).toEqual([
      'registration',
      'authority',
    ])
    expect(page.events[0]?.data?.action_role).toBe('registered')
  })
})
