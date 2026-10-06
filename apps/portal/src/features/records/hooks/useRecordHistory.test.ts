import type { HistoryEvent } from '@ens-apps/bigname'
import type { QueryFunctionContext } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getNameHistory = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getNameHistory } }))

const { getRecordHistoryQueryOptions } = await import('./useRecordHistory')

const ADDRESS = '0x1111111111111111111111111111111111111111'

let nextLog = 0
const record = (
  data: {
    key?: string
    value?: string | { encoding: 'hex'; bytes: string }
    coin_type?: number
  },
  over: Partial<HistoryEvent> = {},
): HistoryEvent =>
  ({
    id: String(nextLog),
    type: 'record',
    name: 'alice.eth',
    namespace: 'ens',
    registration_id: null,
    block_number: 100,
    timestamp: '1781049606',
    transaction_hash: '0xabc',
    log_index: nextLog++,
    kind: 'RecordChanged',
    data,
    ...over,
  }) as HistoryEvent

const page = (data: HistoryEvent[], next: string | null = null) => ({
  data,
  page: {
    cursor: null,
    next_cursor: next,
    page_size: 200,
    total_count: null,
    has_more: next !== null,
  },
  meta: {},
})

const read = async (
  key: string,
  rows?: HistoryEvent[],
  signal?: AbortSignal,
) => {
  if (rows) getNameHistory.mockResolvedValue(page(rows))
  const { queryFn, queryKey } = getRecordHistoryQueryOptions({
    name: 'Alice.eth',
    key,
  })
  return (queryFn as (context: unknown) => Promise<unknown>)({
    queryKey,
    signal,
  } as unknown as QueryFunctionContext)
}

describe('getRecordHistoryQueryOptions', () => {
  beforeEach(() => {
    getNameHistory.mockReset()
    nextLog = 0
  })

  it('reads one key’s rows by record_key, with payloads, newest first', async () => {
    await read('text:url', [])
    expect(getNameHistory).toHaveBeenCalledWith(
      'alice.eth',
      {
        type: 'record',
        record_key: 'text:url',
        include: ['data', 'raw'],
        order: 'desc',
        page_size: 200,
        cursor: undefined,
      },
      { signal: undefined },
    )
  })

  it.each([
    'text:url',
    'coins',
  ])('reads %s history past the old row cap and the default page limit', async (key) => {
    const total = 20_200
    getNameHistory.mockImplementation(
      async (_name, { cursor }: { cursor?: string }) => {
        const offset = Number(cursor ?? 0)
        return page(
          Array.from({ length: 200 }, (_, i) =>
            record({
              key:
                offset + i === total - 1 && key === 'coins'
                  ? 'addr:60'
                  : 'text:url',
              value: String(offset + i),
            }),
          ),
          offset + 200 < total ? String(offset + 200) : null,
        )
      },
    )

    const events = await read(key)
    expect(events).toHaveLength(key === 'coins' ? 1 : total)
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: '20199' })]),
    )
    expect(getNameHistory).toHaveBeenCalledTimes(101)
  })

  it('stops an uncapped walk when the query is cancelled', async () => {
    const controller = new AbortController()
    getNameHistory.mockImplementation(async (_name, _params, { signal }) => {
      expect(signal).toBe(controller.signal)
      controller.abort()
      return page([record({ key: 'text:url', value: 'first' })], 'more')
    })

    await expect(
      read('text:url', undefined, controller.signal),
    ).rejects.toMatchObject({
      cause: controller.signal.reason,
    })
    expect(getNameHistory).toHaveBeenCalledTimes(1)
  })

  it('keeps only the requested key, plus record clears', async () => {
    const events = await read('text:url', [
      record({ key: 'text:url', value: 'https://a' }),
      record({ key: 'text:email', value: 'a@b' }),
      record({}, { kind: 'RecordVersionChanged' }),
    ])
    expect(events).toEqual([
      {
        id: '0xabc-0',
        transactionID: '0xabc',
        blockNumber: 100,
        timestamp: 1_781_049_606n,
        type: 'RecordChanged',
        key: 'text:url',
        value: 'https://a',
      },
      {
        id: '0xabc-2',
        transactionID: '0xabc',
        blockNumber: 100,
        timestamp: 1_781_049_606n,
        type: 'RecordVersionChanged',
      },
    ])
  })

  it('reads a family without record_key, which takes one exact key', async () => {
    await read('texts', [])
    expect(getNameHistory.mock.lastCall?.[1]).not.toHaveProperty('record_key')
  })

  it('reads a value served as raw bytes by its bytes', async () => {
    const events = (await read('contentHash', [
      record({
        key: 'contenthash',
        value: { encoding: 'hex', bytes: '0xe301' } as const,
      }),
    ])) as { value?: string }[]
    expect(events[0]?.value).toBe('0xe301')
  })

  it('reads a family by its key prefix', async () => {
    const events = (await read('coins', [
      record({ key: 'addr:60', coin_type: 60, value: ADDRESS }),
      record({ key: 'addr:2147483658', coin_type: 2147483658, value: ADDRESS }),
      record({ key: 'text:url', value: 'x' }),
    ])) as { key?: string }[]
    expect(events.map((event) => event.key)).toEqual([
      'addr:60',
      'addr:2147483658',
    ])
  })

  it('preserves both legacy setAddr rows returned by bigname', async () => {
    const events = await read('addr:60', [
      record({ key: 'addr:60', coin_type: 60, value: ADDRESS }),
      record({ key: 'addr:60', coin_type: 60, value: ADDRESS }),
    ])
    expect(events).toHaveLength(2)
  })
})
