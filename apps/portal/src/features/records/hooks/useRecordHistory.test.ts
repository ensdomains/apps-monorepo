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

const read = async (key: string, rows: HistoryEvent[]) => {
  getNameHistory.mockResolvedValue({
    data: rows,
    page: {
      cursor: null,
      next_cursor: null,
      page_size: 200,
      total_count: rows.length,
      has_more: false,
    },
    meta: {},
  })
  const { queryFn, queryKey } = getRecordHistoryQueryOptions({
    name: 'Alice.eth',
    key,
  })
  return (queryFn as (context: unknown) => Promise<unknown>)({
    queryKey,
  } as unknown as QueryFunctionContext)
}

describe('getRecordHistoryQueryOptions', () => {
  beforeEach(() => {
    getNameHistory.mockReset()
    nextLog = 0
  })

  it('reads one key’s rows by record_key, with payloads, newest first', async () => {
    await read('text:url', [])
    expect(getNameHistory).toHaveBeenCalledWith('alice.eth', {
      type: 'record',
      record_key: 'text:url',
      include: ['data', 'raw'],
      order: 'desc',
      page_size: 200,
      cursor: undefined,
    })
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

  it('collapses a legacy setAddr double emit into one write', async () => {
    const events = await read('addr:60', [
      record({ key: 'addr:60', coin_type: 60, value: ADDRESS }),
      record({ key: 'addr:60', coin_type: 60, value: ADDRESS }),
    ])
    expect(events).toHaveLength(1)
  })
})
