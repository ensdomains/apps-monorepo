import { describe, expect, it } from 'vitest'
import {
  type AddressNameHistory,
  groupAddressHistoryByName,
} from './transformAddressHistory'

const nameHistory = (
  overrides: Partial<AddressNameHistory> = {},
): AddressNameHistory => ({
  name: 'test.eth',
  registrarHolder: null,
  events: [],
  ...overrides,
})

describe('groupAddressHistoryByName', () => {
  it('should return no groups when no history is provided', () => {
    expect(groupAddressHistoryByName(undefined)).toEqual([])
  })

  it('should carry each name provenance signals through untouched', () => {
    const [group] = groupAddressHistoryByName([
      nameHistory({ name: 'vitalik.eth', registrarHolder: '0xabc' }),
    ])

    expect(group).toMatchObject({
      name: 'vitalik.eth',
      registrarHolder: '0xabc',
    })
  })

  it('should map event fields onto the table event shape', () => {
    const [group] = groupAddressHistoryByName([
      nameHistory({
        events: [
          {
            transactionHash: '0x123abc',
            blockNumber: 200,
            name: 'NameRegistered',
            type: 'NameRegistered',
            timestamp: 1700000000,
          },
        ],
      }),
    ])

    expect(group.events[0]).toEqual({
      transactionID: '0x123abc',
      blockNumber: 200,
      id: 'NameRegistered',
      type: 'NameRegistered',
      timestamp: 1700000000n,
    })
  })

  it('should key a bigname event by its log and carry its payload', () => {
    const [group] = groupAddressHistoryByName([
      nameHistory({
        events: [
          {
            id: '0x123abc-4',
            transactionHash: '0x123abc',
            blockNumber: 200,
            name: 'test.eth',
            type: 'RegistrationGranted',
            timestamp: 1700000000,
            data: { owner: '0x1111111111111111111111111111111111111111' },
          },
        ],
      }),
    ])

    expect(group.events[0]).toEqual({
      owner: '0x1111111111111111111111111111111111111111',
      transactionID: '0x123abc',
      blockNumber: 200,
      id: '0x123abc-4',
      type: 'RegistrationGranted',
      timestamp: 1700000000n,
    })
  })

  it('should leave events ungrouped so grouping can happen after attribution', () => {
    const [group] = groupAddressHistoryByName([
      nameHistory({
        events: [
          {
            id: 'event1',
            transactionHash: '0xsametx',
            blockNumber: 100,
            name: 'test.eth',
            type: 'Transfer',
            timestamp: 1700000000,
          },
          {
            id: 'event2',
            transactionHash: '0xsametx',
            blockNumber: 100,
            name: 'test.eth',
            type: 'NewOwner',
            timestamp: 1700000000,
          },
        ],
      }),
    ])

    expect(group.events).toHaveLength(2)
  })

  it('should keep one group per name', () => {
    const result = groupAddressHistoryByName([
      nameHistory({ name: 'one.eth' }),
      nameHistory({ name: 'two.eth' }),
    ])

    expect(result.map((group) => group.name)).toEqual(['one.eth', 'two.eth'])
  })
})
