import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { describe, expect, it } from 'vitest'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import {
  getV2EventTypesForRecord,
  type HistoryEvent,
  sortHistoryEvents,
  transformV1Events,
} from './transformRecordHistory'

describe('transformRecordHistory', () => {
  describe('getV2EventTypesForRecord', () => {
    it('should return TextChanged for text records', () => {
      const record: NameRecord = { type: 'text', key: 'name', value: 'John' }
      expect(getV2EventTypesForRecord(record)).toEqual([
        'TextUpdated',
        'TextChanged',
      ])
    })

    it('should return AddressChanged for address records', () => {
      const record: NameRecord = {
        type: 'address',
        key: 'ETH',
        value: '0x123',
        id: 60,
      }
      expect(getV2EventTypesForRecord(record)).toEqual([
        'AddressUpdated',
        'AddressChanged',
      ])
    })

    it('should return ContenthashChanged for contentHash records', () => {
      const record: NameRecord = { type: 'contentHash', value: 'ipfs://...' }
      expect(getV2EventTypesForRecord(record)).toEqual([
        'ContenthashUpdated',
        'ContenthashChanged',
      ])
    })

    it('should return ABIChanged for abi records', () => {
      const record: NameRecord = { type: 'abi', value: '[{"type":"function"}]' }
      expect(getV2EventTypesForRecord(record)).toEqual([
        'ABIUpdated',
        'ABIChanged',
      ])
    })
  })

  describe('transformV1Events', () => {
    const createV1Event = (
      type: string,
      extra: Record<string, unknown> = {},
    ): ReturnResolverEvent =>
      ({
        type,
        blockNumber: 12345,
        transactionID: '0x123',
        id: '1',
        ...extra,
      }) as unknown as ReturnResolverEvent

    it('should transform TextChanged events with key:value format', () => {
      const events = [
        createV1Event('TextChanged', { key: 'name', value: 'John' }),
      ]

      const result = transformV1Events(events)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        blockNumber: 12345,
        timestamp: undefined,
        transactionHash: '0x123',
        type: 'TextChanged',
        value: 'name: John',
      })
    })

    it('should transform TextChanged events with null value', () => {
      const events = [
        createV1Event('TextChanged', { key: 'name', value: null }),
      ]

      const result = transformV1Events(events)

      expect(result[0].value).toBe('name: null')
    })

    it('should transform AddrChanged events', () => {
      const events = [createV1Event('AddrChanged', { addr: '0xabc' })]

      const result = transformV1Events(events)

      expect(result[0].value).toBe('0xabc')
    })

    it('should transform MulticoinAddrChanged events', () => {
      const events = [
        createV1Event('MulticoinAddrChanged', { addr: 'bc1q...' }),
      ]

      const result = transformV1Events(events)

      expect(result[0].value).toBe('bc1q...')
    })

    it('should transform ContenthashChanged events', () => {
      const events = [
        createV1Event('ContenthashChanged', { contentHash: 'ipfs://abc' }),
      ]

      const result = transformV1Events(events)

      expect(result[0].value).toBe('ipfs://abc')
    })

    it('should include timestamps from blockTimestamps map', () => {
      const events = [
        createV1Event('TextChanged', { key: 'name', value: 'John' }),
      ]
      const blockTimestamps = new Map([[BigInt(12345), BigInt(1700000000)]])

      const result = transformV1Events(events, blockTimestamps)

      expect(result[0].timestamp).toBe(1700000000)
    })

    it('should leave timestamp undefined if not in map', () => {
      const events = [
        createV1Event('TextChanged', { key: 'name', value: 'John' }),
      ]
      const blockTimestamps = new Map([[BigInt(99999), BigInt(1700000000)]])

      const result = transformV1Events(events, blockTimestamps)

      expect(result[0].timestamp).toBeUndefined()
    })
  })

  describe('sortHistoryEvents', () => {
    it('should sort events by timestamp descending', () => {
      const events: HistoryEvent[] = [
        {
          blockNumber: 100,
          timestamp: 1000,
          transactionHash: '0x1',
          type: 'A',
          value: 'a',
        },
        {
          blockNumber: 300,
          timestamp: 3000,
          transactionHash: '0x3',
          type: 'C',
          value: 'c',
        },
        {
          blockNumber: 200,
          timestamp: 2000,
          transactionHash: '0x2',
          type: 'B',
          value: 'b',
        },
      ]

      const result = sortHistoryEvents(events)

      expect(result.map((e) => e.type)).toEqual(['C', 'B', 'A'])
    })

    it('should fall back to block number when timestamps are missing', () => {
      const events: HistoryEvent[] = [
        { blockNumber: 100, transactionHash: '0x1', type: 'A', value: 'a' },
        { blockNumber: 300, transactionHash: '0x3', type: 'C', value: 'c' },
        { blockNumber: 200, transactionHash: '0x2', type: 'B', value: 'b' },
      ]

      const result = sortHistoryEvents(events)

      expect(result.map((e) => e.type)).toEqual(['C', 'B', 'A'])
    })

    it('should handle mixed events with and without timestamps', () => {
      const events: HistoryEvent[] = [
        {
          blockNumber: 100,
          timestamp: 1000,
          transactionHash: '0x1',
          type: 'A',
          value: 'a',
        },
        { blockNumber: 300, transactionHash: '0x3', type: 'C', value: 'c' }, // no timestamp
        {
          blockNumber: 200,
          timestamp: 2000,
          transactionHash: '0x2',
          type: 'B',
          value: 'b',
        },
      ]

      const result = sortHistoryEvents(events)

      // C has no timestamp, so falls back to block number comparison
      // B vs A: both have timestamps, B > A
      // C vs others: falls back to block number
      expect(result.map((e) => e.type)).toEqual(['C', 'B', 'A'])
    })

    it('should not mutate the original array', () => {
      const events: HistoryEvent[] = [
        {
          blockNumber: 100,
          timestamp: 1000,
          transactionHash: '0x1',
          type: 'A',
          value: 'a',
        },
        {
          blockNumber: 200,
          timestamp: 2000,
          transactionHash: '0x2',
          type: 'B',
          value: 'b',
        },
      ]
      const originalOrder = events.map((e) => e.type)

      sortHistoryEvents(events)

      expect(events.map((e) => e.type)).toEqual(originalOrder)
    })

    it('should return empty array for empty input', () => {
      expect(sortHistoryEvents([])).toEqual([])
    })
  })
})
