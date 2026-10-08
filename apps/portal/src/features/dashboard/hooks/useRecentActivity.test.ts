import type { NameHistoryRow } from '@ens-apps/indexer/bigname'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listEvents = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    events: (...args: unknown[]) =>
      ResultAsync.fromPromise(listEvents(...args), (e) => e),
  },
}))

const { getRecentActivityQueryOptions } = await import('./useRecentActivity')

const row = (over: Partial<NameHistoryRow>): NameHistoryRow =>
  ({
    id: 'a'.repeat(64),
    type: 'record',
    name: 'alice.eth',
    namespace: 'ens',
    registration_id: null,
    block_number: 100,
    timestamp: '1781049606',
    transaction_hash: '0xabc',
    log_index: 1,
    contract_address: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
    data: {},
    ...over,
  }) as NameHistoryRow

const fetchPage = async (rows: NameHistoryRow[]) => {
  listEvents.mockResolvedValue({
    data: rows,
    page: {
      cursor: null,
      next_cursor: 'next',
      page_size: 15,
      total_count: null,
      has_more: true,
    },
    meta: {},
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
      page_size: 15,
      include: ['data', 'raw'],
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
      row({ type: 'renewal', data: undefined }),
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
      row({ id: 'lapse', type: 'release', transaction_hash: null }),
    ])) as { events: { name: string | null; namehash: string | null }[] }

    expect(page.events).toHaveLength(1)
    expect(page.events[0]).toMatchObject({ name: null, namehash: null })
  })
})
