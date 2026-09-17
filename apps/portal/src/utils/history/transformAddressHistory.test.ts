import type { Hash } from 'viem'
import { describe, expect, it } from 'vitest'
import type { EventsTableData } from '@/components/table/EventsDataTable/types'
import {
  extractBlocksNeedingTimestamps,
  extractTransactionHashes,
  groupAddressHistoryByName,
  type V1NameHistory,
  type V2NameHistory,
} from './transformAddressHistory'
import type { ENSEvent } from './transformHistoryToEvents'

const v1Name = (
  events: Partial<
    Pick<
      V1NameHistory,
      'domainEvents' | 'registrationEvents' | 'resolverEvents'
    >
  >,
  provenance: Partial<V1NameHistory> = {},
): V1NameHistory => ({
  name: 'test.eth',
  registrarHolder: null,
  domainEvents: [],
  registrationEvents: [],
  resolverEvents: [],
  ...events,
  ...provenance,
})

const v2Name = (events: V2NameHistory['events']): V2NameHistory => ({
  name: 'test.eth',
  registrarHolder: null,
  events,
})

const groupV1 = (nameHistory: V1NameHistory) =>
  groupAddressHistoryByName([nameHistory])[0]

const groupV2 = (nameHistory: V2NameHistory) =>
  groupAddressHistoryByName(undefined, [nameHistory])[0]

describe('transformAddressHistory', () => {
  describe('V1 name history', () => {
    it('should return no rows when the name has no events', () => {
      expect(groupV1(v1Name({})).rows).toEqual([])
    })

    it('should carry the provenance signals through untouched', () => {
      const result = groupV1(
        v1Name({}, { name: 'vitalik.eth', registrarHolder: '0xabc' }),
      )

      expect(result).toMatchObject({
        name: 'vitalik.eth',
        registrarHolder: '0xabc',
      })
    })

    it('should transform and group V1 domain events', () => {
      const result = groupV1(
        v1Name({
          domainEvents: [
            {
              id: 'event1',
              transactionID: '0xabc123',
              blockNumber: 100,
              type: 'Transfer',
            },
            {
              id: 'event2',
              transactionID: '0xabc123',
              blockNumber: 100,
              type: 'NewOwner',
            },
          ],
        }),
      ).rows

      expect(result).toHaveLength(1)
      expect(result[0].transactionID).toBe('0xabc123')
      expect(result[0].blockNumber).toBe(100)
      expect(result[0].events).toHaveLength(2)
      expect(result[0].events[0].type).toBe('Transfer')
      expect(result[0].events[1].type).toBe('NewOwner')
    })

    it('should transform and group events from all V1 categories', () => {
      const result = groupV1(
        v1Name({
          domainEvents: [
            {
              id: 'domain1',
              transactionID: '0xabc123',
              blockNumber: 100,
              type: 'Transfer',
            },
          ],
          registrationEvents: [
            {
              id: 'reg1',
              transactionID: '0xabc123',
              blockNumber: 100,
              type: 'NameRegistered',
            },
          ],
          resolverEvents: [
            {
              id: 'resolver1',
              transactionID: '0xdef456',
              blockNumber: 101,
              type: 'AddrChanged',
            },
          ],
        }),
      ).rows

      expect(result).toHaveLength(2) // 2 different transactions
      // Sorted by block number descending, so block 101 comes first
      expect(result[0].blockNumber).toBe(101)
      expect(result[0].events).toHaveLength(1) // 1 event in first tx (block 101)
      expect(result[1].blockNumber).toBe(100)
      expect(result[1].events).toHaveLength(2) // 2 events in second tx (block 100)
    })

    it('should not create duplicate keys for same transaction events', () => {
      const result = groupV1(
        v1Name({
          domainEvents: [
            {
              id: 'event1',
              transactionID: '0xsametx',
              blockNumber: 100,
              type: 'Transfer',
            },
            {
              id: 'event2',
              transactionID: '0xsametx',
              blockNumber: 100,
              type: 'NewOwner',
            },
            {
              id: 'event3',
              transactionID: '0xsametx',
              blockNumber: 100,
              type: 'NewResolver',
            },
          ],
        }),
      ).rows

      // All events should be grouped into a single transaction
      expect(result).toHaveLength(1)
      expect(result[0].transactionID).toBe('0xsametx')
      expect(result[0].events).toHaveLength(3)
    })
  })

  describe('V2 name history', () => {
    it('should return no rows when the name has no events', () => {
      expect(groupV2(v2Name([])).rows).toEqual([])
    })

    it('should transform V2 events with timestamps', () => {
      const result = groupV2(
        v2Name([
          {
            transactionHash: '0x123abc',
            blockNumber: 200,
            name: 'test.eth',
            type: 'NameRegistered',
            timestamp: 1700000000,
          },
          {
            transactionHash: '0x123abc',
            blockNumber: 200,
            name: 'test.eth',
            type: 'Transfer',
            timestamp: 1700000000,
          },
        ]),
      ).rows

      expect(result).toHaveLength(1)
      expect(result[0].transactionID).toBe('0x123abc')
      expect(result[0].blockNumber).toBe(200)
      expect(result[0].timestamp).toBe(1700000000n)
      expect(result[0].events).toHaveLength(2)
    })

    it('should group V2 events by transaction hash', () => {
      const result = groupV2(
        v2Name([
          {
            transactionHash: '0xaaa',
            blockNumber: 200,
            name: 'test1.eth',
            type: 'Transfer',
            timestamp: 1700000000,
          },
          {
            transactionHash: '0xbbb',
            blockNumber: 201,
            name: 'test2.eth',
            type: 'Transfer',
            timestamp: 1700000001,
          },
        ]),
      ).rows

      expect(result).toHaveLength(2)
      // Sorted by block number descending, so block 201 comes first
      expect(result[0].transactionID).toBe('0xbbb')
      expect(result[0].blockNumber).toBe(201)
      expect(result[1].transactionID).toBe('0xaaa')
      expect(result[1].blockNumber).toBe(200)
    })
  })

  describe('groupAddressHistoryByName', () => {
    it('should return no groups when no history is provided', () => {
      expect(groupAddressHistoryByName(undefined, undefined)).toEqual([])
    })

    it('should keep one group per name across both protocol versions', () => {
      const result = groupAddressHistoryByName(
        [
          v1Name(
            {
              domainEvents: [
                {
                  id: 'event1',
                  transactionID: '0xabc123',
                  blockNumber: 100,
                  type: 'Transfer',
                },
              ],
            },
            { name: 'one.eth' },
          ),
        ],
        [
          {
            ...v2Name([
              {
                transactionHash: '0xdef456',
                blockNumber: 200,
                name: 'two.eth',
                type: 'Transfer',
                timestamp: 1700000000,
              },
            ]),
            name: 'two.eth',
          },
        ],
      )

      expect(result.map((group) => group.name)).toEqual(['one.eth', 'two.eth'])
      expect(result[0].rows[0].transactionID).toBe('0xabc123')
      expect(result[1].rows[0].transactionID).toBe('0xdef456')
    })
  })

  describe('extractBlocksNeedingTimestamps', () => {
    it('should extract blocks without timestamps', () => {
      const events: EventsTableData<ENSEvent>[] = [
        {
          transactionID: '0x1',
          blockNumber: 100,
          from: null,
          events: [],
          // No timestamp
        },
        {
          transactionID: '0x2',
          blockNumber: 200,
          from: null,
          events: [],
          timestamp: 1700000000n,
        },
        {
          transactionID: '0x3',
          blockNumber: 300,
          from: null,
          events: [],
          // No timestamp
        },
      ]

      const result = extractBlocksNeedingTimestamps(events)

      expect(result).toHaveLength(2)
      expect(result).toContain(100n)
      expect(result).toContain(300n)
      expect(result).not.toContain(200n)
    })

    it('should return empty array when all events have timestamps', () => {
      const events: EventsTableData<ENSEvent>[] = [
        {
          transactionID: '0x1',
          blockNumber: 100,
          from: null,
          events: [],
          timestamp: 1700000000n,
        },
      ]

      const result = extractBlocksNeedingTimestamps(events)
      expect(result).toEqual([])
    })

    it('should return all blocks when no events have timestamps', () => {
      const events: EventsTableData<ENSEvent>[] = [
        {
          transactionID: '0x1',
          blockNumber: 100,
          from: null,
          events: [],
        },
        {
          transactionID: '0x2',
          blockNumber: 200,
          from: null,
          events: [],
        },
      ]

      const result = extractBlocksNeedingTimestamps(events)
      expect(result).toHaveLength(2)
      expect(result).toContain(100n)
      expect(result).toContain(200n)
    })
  })

  describe('extractTransactionHashes', () => {
    it('should extract all transaction hashes', () => {
      const events: EventsTableData<ENSEvent>[] = [
        {
          transactionID: '0xabc123' as Hash,
          blockNumber: 100,
          from: null,
          events: [],
        },
        {
          transactionID: '0xdef456' as Hash,
          blockNumber: 200,
          from: null,
          events: [],
        },
      ]

      const result = extractTransactionHashes(events)

      expect(result).toHaveLength(2)
      expect(result).toContain('0xabc123')
      expect(result).toContain('0xdef456')
    })

    it('should return empty array for empty events', () => {
      const result = extractTransactionHashes([])
      expect(result).toEqual([])
    })

    it('should extract hashes in order', () => {
      const events: EventsTableData<ENSEvent>[] = [
        {
          transactionID: '0x111' as Hash,
          blockNumber: 300,
          from: null,
          events: [],
        },
        {
          transactionID: '0x222' as Hash,
          blockNumber: 200,
          from: null,
          events: [],
        },
        {
          transactionID: '0x333' as Hash,
          blockNumber: 100,
          from: null,
          events: [],
        },
      ]

      const result = extractTransactionHashes(events)

      expect(result).toHaveLength(3)
      expect(result[0]).toBe('0x111')
      expect(result[1]).toBe('0x222')
      expect(result[2]).toBe('0x333')
    })
  })
})
