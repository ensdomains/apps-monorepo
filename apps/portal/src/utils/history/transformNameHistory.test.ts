import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
import { describe, expect, it } from 'vitest'
import type { V2NameHistoryEvent } from '@/features/profile/hooks/useV2NameHistory'
import { transformAndMergeNameHistory } from './transformNameHistory'

describe('transformAndMergeNameHistory', () => {
  describe('Empty Input', () => {
    it('should return empty array when no history is provided', () => {
      const result = transformAndMergeNameHistory()

      expect(result).toEqual([])
    })

    it('should return empty array when both V1 and V2 are empty', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [],
        registrationEvents: [],
        resolverEvents: [],
      }
      const v2History: V2NameHistoryEvent[] = []

      const result = transformAndMergeNameHistory(v1History, v2History)

      expect(result).toEqual([])
    })
  })

  describe('V1 History Only', () => {
    it('should transform V1 domain events', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0x123',
          },
        ],
        registrationEvents: [],
        resolverEvents: [],
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result).toHaveLength(1)
      expect(result[0].transactionID).toBe('0x123')
      expect(result[0].blockNumber).toBe(100)
      expect(result[0].events).toHaveLength(1)
      expect(result[0].events[0].type).toBe('Transfer')
      expect(result[0].events[0].category).toBe('domain')
    })

    it('should transform V1 registration events', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [],
        registrationEvents: [
          {
            id: 'vitalik.eth',
            type: 'NameRegistered',
            transactionID: '0x456',
            blockNumber: 200,
            registrant: '0x456',
            expiryDate: '1000000',
          },
        ],
        resolverEvents: [],
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result).toHaveLength(1)
      expect(result[0].events[0].type).toBe('NameRegistered')
      expect(result[0].events[0].category).toBe('registration')
    })

    it('should transform V1 resolver events', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [],
        registrationEvents: [],
        resolverEvents: [
          {
            id: 'vitalik.eth',
            type: 'AddrChanged',
            transactionID: '0x789',
            blockNumber: 300,
            addr: '0x789',
          },
        ],
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result).toHaveLength(1)
      expect(result[0].events[0].type).toBe('AddrChanged')
      expect(result[0].events[0].category).toBe('resolver')
    })

    it('should group V1 events by transaction ID', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0x123',
          },
        ],
        registrationEvents: [
          {
            id: 'vitalik.eth',
            type: 'NameRegistered',
            transactionID: '0x123',
            blockNumber: 100,
            registrant: '0x123',
            expiryDate: '1000000',
          },
        ],
        resolverEvents: [],
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result).toHaveLength(1)
      expect(result[0].events).toHaveLength(2)
      expect(result[0].events[0].type).toBe('Transfer')
      expect(result[0].events[1].type).toBe('NameRegistered')
    })
  })

  describe('V2 History Only', () => {
    it('should transform V2 events', () => {
      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'Transfer',
          transactionHash: '0xabc',
          timestamp: 1000,
          blockNumber: 400,
        },
      ]

      const result = transformAndMergeNameHistory(undefined, v2History)

      expect(result).toHaveLength(1)
      expect(result[0].transactionID).toBe('0xabc')
      expect(result[0].blockNumber).toBe(400)
      expect(result[0].events).toHaveLength(1)
      expect(result[0].events[0].type).toBe('Transfer')
      expect(result[0].events[0].category).toBe('domain')
    })

    it('should group V2 events by transaction ID', () => {
      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'Transfer',
          transactionHash: '0xabc',
          timestamp: 1000,
          blockNumber: 400,
        },
        {
          name: 'vitalik.eth',
          type: 'NameRegistered',
          transactionHash: '0xabc',
          timestamp: 1000,
          blockNumber: 400,
        },
      ]

      const result = transformAndMergeNameHistory(undefined, v2History)

      expect(result).toHaveLength(1)
      expect(result[0].events).toHaveLength(2)
    })
  })

  describe('Merged V1 and V2 History', () => {
    it('should merge V1 and V2 events', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0x123',
          },
        ],
        registrationEvents: [],
        resolverEvents: [],
      }

      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'Transfer',
          transactionHash: '0xabc',
          timestamp: 1000,
          blockNumber: 400,
        },
      ]

      const result = transformAndMergeNameHistory(v1History, v2History)

      expect(result).toHaveLength(2)
      expect(result[0].transactionID).toBe('0xabc') // V2 event (newer)
      expect(result[1].transactionID).toBe('0x123') // V1 event (older)
    })

    it('should sort merged events by block number descending', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x100',
            blockNumber: 100,
            owner: '0x100',
          },
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x300',
            blockNumber: 300,
            owner: '0x300',
          },
        ],
        registrationEvents: [],
        resolverEvents: [],
      }

      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'Transfer',
          transactionHash: '0x200',
          timestamp: 1000,
          blockNumber: 200,
        },
        {
          name: 'vitalik.eth',
          type: 'Transfer',
          transactionHash: '0x400',
          timestamp: 1000,
          blockNumber: 400,
        },
      ]

      const result = transformAndMergeNameHistory(v1History, v2History)

      expect(result).toHaveLength(4)
      expect(result[0].blockNumber).toBe(400)
      expect(result[1].blockNumber).toBe(300)
      expect(result[2].blockNumber).toBe(200)
      expect(result[3].blockNumber).toBe(100)
    })

    it('should merge events from the same transaction across V1 and V2', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0x123',
          },
        ],
        registrationEvents: [],
        resolverEvents: [],
      }

      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'NameRegistered',
          transactionHash: '0x123',
          timestamp: 1000,
          blockNumber: 100,
        },
      ]

      const result = transformAndMergeNameHistory(v1History, v2History)

      expect(result).toHaveLength(1)
      expect(result[0].transactionID).toBe('0x123')
      expect(result[0].events).toHaveLength(2)
      expect(result[0].events[0].type).toBe('Transfer')
      expect(result[0].events[1].type).toBe('NameRegistered')
    })
  })

  describe('Edge Cases', () => {
    it('should handle V1 history with null registration events', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0x123',
          },
        ],
        registrationEvents: null,
        resolverEvents: null,
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result).toHaveLength(1)
      expect(result[0].events).toHaveLength(1)
      expect(result[0].events[0].type).toBe('Transfer')
    })

    it('should handle mixed event categories in same transaction', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0x123',
          },
        ],
        registrationEvents: [
          {
            id: 'vitalik.eth',
            type: 'NameRegistered',
            transactionID: '0x123',
            blockNumber: 100,
            registrant: '0x123',
            expiryDate: '1000000',
          },
        ],
        resolverEvents: [
          {
            id: 'vitalik.eth',
            type: 'AddrChanged',
            transactionID: '0x123',
            blockNumber: 100,
            addr: '0x123',
          },
        ],
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result).toHaveLength(1)
      expect(result[0].events).toHaveLength(3)
      expect(result[0].events[0].category).toBe('domain')
      expect(result[0].events[1].category).toBe('registration')
      expect(result[0].events[2].category).toBe('resolver')
    })

    it('should handle empty arrays vs null for V1 events', () => {
      const v1HistoryWithEmpty: GetNameHistoryReturnType = {
        domainEvents: [],
        registrationEvents: [],
        resolverEvents: [],
      }

      const v1HistoryWithNull: GetNameHistoryReturnType = {
        domainEvents: [],
        registrationEvents: null,
        resolverEvents: null,
      }

      const resultEmpty = transformAndMergeNameHistory(v1HistoryWithEmpty)
      const resultNull = transformAndMergeNameHistory(v1HistoryWithNull)

      expect(resultEmpty).toEqual([])
      expect(resultNull).toEqual([])
    })

    it('should preserve event details in the output', () => {
      const v1History: GetNameHistoryReturnType = {
        domainEvents: [
          {
            id: 'vitalik.eth',
            type: 'Transfer',
            transactionID: '0x123',
            blockNumber: 100,
            owner: '0xabc',
            // biome-ignore lint/suspicious/noExplicitAny: test data
          } as any,
        ],
        registrationEvents: [],
        resolverEvents: [],
      }

      const result = transformAndMergeNameHistory(v1History)

      expect(result[0].events[0].details).toEqual({
        id: 'vitalik.eth',
        type: 'Transfer',
        transactionID: '0x123',
        blockNumber: 100,
        owner: '0xabc',
      })
    })

    it('should handle V2 events with null name field', () => {
      const v2History: V2NameHistoryEvent[] = [
        {
          name: null as unknown as string,
          type: 'TextChanged',
          transactionHash: '0x123',
          timestamp: 1000,
          blockNumber: 100,
        },
      ]

      const result = transformAndMergeNameHistory(undefined, v2History)

      expect(result).toHaveLength(1)
      expect(result[0].events[0].id).toBe(null)
    })
  })

  describe('Event Categorization', () => {
    it('should categorize registration events correctly', () => {
      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'NameRegistered',
          transactionHash: '0x123',
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          name: 'vitalik.eth',
          type: 'NameRenewed',
          transactionHash: '0x456',
          timestamp: 1000,
          blockNumber: 200,
        },
      ]

      const result = transformAndMergeNameHistory(undefined, v2History)

      expect(result[0].events[0].category).toBe('registration')
      expect(result[1].events[0].category).toBe('registration')
    })

    it('should categorize resolver events correctly', () => {
      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'ResolverUpdated',
          transactionHash: '0x123',
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          name: 'vitalik.eth',
          type: 'TextChanged',
          transactionHash: '0x456',
          timestamp: 1000,
          blockNumber: 200,
        },
        {
          name: 'vitalik.eth',
          type: 'AddrChanged',
          transactionHash: '0x789',
          timestamp: 1000,
          blockNumber: 300,
        },
      ]

      const result = transformAndMergeNameHistory(undefined, v2History)

      expect(result[0].events[0].category).toBe('resolver')
      expect(result[1].events[0].category).toBe('resolver')
      expect(result[2].events[0].category).toBe('resolver')
    })

    it('should categorize domain events as default', () => {
      const v2History: V2NameHistoryEvent[] = [
        {
          name: 'vitalik.eth',
          type: 'Transfer',
          transactionHash: '0x123',
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          name: 'vitalik.eth',
          type: 'SomeOtherEvent',
          transactionHash: '0x456',
          timestamp: 1000,
          blockNumber: 200,
        },
      ]

      const result = transformAndMergeNameHistory(undefined, v2History)

      expect(result[0].events[0].category).toBe('domain')
      expect(result[1].events[0].category).toBe('domain')
    })
  })
})
