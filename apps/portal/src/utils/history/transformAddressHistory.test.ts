import { describe, expect, it } from 'vitest'
import {
  groupAddressHistoryByName,
  type V1NameHistory,
} from './transformAddressHistory'

const v1Name = (overrides: Partial<V1NameHistory> = {}): V1NameHistory => ({
  name: 'test.eth',
  registrarHolder: null,
  domainEvents: [],
  registrationEvents: [],
  resolverEvents: [],
  ...overrides,
})

describe('groupAddressHistoryByName', () => {
  it('should return no groups when no history is provided', () => {
    expect(groupAddressHistoryByName(undefined, undefined)).toEqual([])
  })

  it('should carry each name provenance signals through untouched', () => {
    const [group] = groupAddressHistoryByName([
      v1Name({ name: 'vitalik.eth', registrarHolder: '0xabc' }),
    ])

    expect(group).toMatchObject({
      name: 'vitalik.eth',
      registrarHolder: '0xabc',
    })
  })

  it('should tag V1 events with the category they came from', () => {
    const [group] = groupAddressHistoryByName([
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
    ])

    expect(group.events.map((event) => [event.id, event.category])).toEqual([
      ['domain1', 'domain'],
      ['reg1', 'registration'],
      ['resolver1', 'resolver'],
    ])
  })

  it('should leave V1 events ungrouped so grouping can happen after attribution', () => {
    const [group] = groupAddressHistoryByName([
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
        ],
      }),
    ])

    expect(group.events).toHaveLength(2)
  })

  it('should map V2 indexer fields onto the table event shape', () => {
    const [group] = groupAddressHistoryByName(undefined, [
      {
        name: 'test.eth',
        registrarHolder: null,
        events: [
          {
            transactionHash: '0x123abc',
            blockNumber: 200,
            name: 'NameRegistered',
            type: 'NameRegistered',
            timestamp: 1700000000,
          },
        ],
      },
    ])

    expect(group.events[0]).toEqual({
      transactionID: '0x123abc',
      blockNumber: 200,
      id: 'NameRegistered',
      type: 'NameRegistered',
      timestamp: 1700000000n,
    })
  })

  it('should keep one group per name across both protocol versions', () => {
    const result = groupAddressHistoryByName(
      [
        v1Name({
          name: 'one.eth',
          domainEvents: [
            {
              id: 'event1',
              transactionID: '0xabc123',
              blockNumber: 100,
              type: 'Transfer',
            },
          ],
        }),
      ],
      [
        {
          name: 'two.eth',
          registrarHolder: null,
          events: [
            {
              transactionHash: '0xdef456',
              blockNumber: 200,
              name: 'Transfer',
              type: 'Transfer',
              timestamp: 1700000000,
            },
          ],
        },
      ],
    )

    expect(result.map((group) => group.name)).toEqual(['one.eth', 'two.eth'])
    expect(result[0].events[0].transactionID).toBe('0xabc123')
    expect(result[1].events[0].transactionID).toBe('0xdef456')
  })
})
