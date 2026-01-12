import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import { describe, expect, it } from 'vitest'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { filterRecordHistoryByRecord } from './filterRecordHistoryByRecord'

// Note: Using type assertions for mock event data in tests
describe('filterRecordHistoryByRecord', () => {
  describe('AddrChanged events', () => {
    it('should filter AddrChanged events by matching address', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'AddrChanged',
          addr: '0x1234',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
        {
          type: 'AddrChanged',
          addr: '0x5678',
          transactionID: 'tx2',
          blockNumber: 101,
          id: '2',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'address',
        value: '0x1234',
        key: 'ETH',
        id: 60,
      }

      const result = filterRecordHistoryByRecord(events, record)

      expect(result).toHaveLength(1)
      expect((result[0] as any).addr).toBe('0x1234')
    })

    it('should return empty array when no AddrChanged events match', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'AddrChanged',
          addr: '0x9999',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'address',
        value: '0x1234',
        key: 'ETH',
        id: 60,
      }

      const result = filterRecordHistoryByRecord(events, record)
      expect(result).toHaveLength(0)
    })
  })

  describe('MulticoinAddrChanged events', () => {
    it('should filter MulticoinAddrChanged events by matching address', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'MulticoinAddrChanged',
          addr: 'bc1q...',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
        {
          type: 'MulticoinAddrChanged',
          addr: '0x1234',
          transactionID: 'tx2',
          blockNumber: 101,
          id: '2',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'address',
        value: '0x1234',
        key: 'ETH',
        id: 60,
      }

      const result = filterRecordHistoryByRecord(events, record)

      expect(result).toHaveLength(1)
      expect((result[0] as any).addr).toBe('0x1234')
    })
  })

  describe('TextChanged events', () => {
    it('should filter TextChanged events by matching key', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'TextChanged',
          key: 'email',
          value: 'test@example.com',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
        {
          type: 'TextChanged',
          key: 'url',
          value: 'https://example.com',
          transactionID: 'tx2',
          blockNumber: 101,
          id: '2',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'text',
        key: 'email',
        value: 'test@example.com',
      }

      const result = filterRecordHistoryByRecord(events, record)

      expect(result).toHaveLength(1)
      expect((result[0] as any).key).toBe('email')
    })

    it('should return empty array when no TextChanged events match', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'TextChanged',
          key: 'url',
          value: 'https://example.com',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'text',
        key: 'email',
        value: 'test@example.com',
      }

      const result = filterRecordHistoryByRecord(events, record)
      expect(result).toHaveLength(0)
    })
  })

  describe('other event types', () => {
    it('should include all other event types regardless of record', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'ContenthashChanged',
          hash: '0xabcd',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
        {
          type: 'NameChanged',
          name: 'test.eth',
          transactionID: 'tx2',
          blockNumber: 101,
          id: '2',
        },
        {
          type: 'AbiChanged',
          contentType: 1,
          transactionID: 'tx3',
          blockNumber: 102,
          id: '3',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'text',
        key: 'email',
        value: 'test@example.com',
      }

      const result = filterRecordHistoryByRecord(events, record)

      expect(result).toHaveLength(3)
      expect(result.map((e) => e.type)).toEqual([
        'ContenthashChanged',
        'NameChanged',
        'AbiChanged',
      ])
    })
  })

  describe('mixed event types', () => {
    it('should filter by record and include non-targeted event types', () => {
      const events: ReturnResolverEvent[] = [
        {
          type: 'AddrChanged',
          addr: '0x1234',
          transactionID: 'tx1',
          blockNumber: 100,
          id: '1',
        },
        {
          type: 'AddrChanged',
          addr: '0x5678',
          transactionID: 'tx2',
          blockNumber: 101,
          id: '2',
        },
        {
          type: 'ContenthashChanged',
          hash: '0xabcd',
          transactionID: 'tx3',
          blockNumber: 102,
          id: '3',
        },
      ] as unknown as ReturnResolverEvent[]

      const record: NameRecord = {
        type: 'address',
        value: '0x1234',
        key: 'ETH',
        id: 60,
      }

      const result = filterRecordHistoryByRecord(events, record)

      // Should include: matching AddrChanged (0x1234) + ContenthashChanged (non-targeted event)
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('AddrChanged')
      expect((result[0] as any).addr).toBe('0x1234')
      expect(result[1].type).toBe('ContenthashChanged')
    })
  })
})
