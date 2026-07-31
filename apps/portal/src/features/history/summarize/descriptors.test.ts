import { describe, expect, it } from 'vitest'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { DESCRIPTORS, humanizeType } from './descriptors'

describe('humanizeType', () => {
  it('sentence-cases camel-cased event types', () => {
    expect(humanizeType('NameRegistered')).toBe('Name registered')
    expect(humanizeType('SubregistryUpdated')).toBe('Subregistry updated')
    expect(humanizeType('AddrChanged')).toBe('Addr changed')
  })

  it('preserves acronyms', () => {
    expect(humanizeType('EACRolesChanged')).toBe('EAC roles changed')
  })
})

describe('AddressChanged descriptor', () => {
  const base = {
    id: '1',
    type: 'AddressChanged',
    transactionHash: '0xabc',
    blockNumber: 1,
    timestamp: 1,
    name: 'absquatulate.eth',
  } as TimelineIndexerEvent

  it('renders ETH address sets as Set primary name name ↔ address', () => {
    const built = DESCRIPTORS.AddressChanged.build({
      primary: {
        ...base,
        asAddressChanged: {
          address: '0x801d2e48d378f161dba7ad7ad002ad557714c191',
          coinType: 60,
        },
      },
      events: [],
    })
    expect(built).toEqual({
      label: 'Set primary name',
      slots: [
        { kind: 'name', value: 'absquatulate.eth' },
        { kind: 'glyph', value: '↔' },
        {
          kind: 'address',
          value: '0x801d2e48d378f161dba7ad7ad002ad557714c191',
        },
      ],
    })
  })

  it('keeps non-ETH coin address sets as Set address to', () => {
    const built = DESCRIPTORS.AddressChanged.build({
      primary: {
        ...base,
        asAddressChanged: {
          address: '0x00143024278442c1aa4b3bfa66796b4d21d06cd23f58',
          coinType: 0,
        },
      },
      events: [],
    })
    expect(built).toEqual({
      label: 'Set address to',
      slots: [
        {
          kind: 'address',
          value: '0x00143024278442c1aa4b3bfa66796b4d21d06cd23f58',
        },
      ],
    })
  })
})
