import { describe, expect, it } from 'vitest'
import type { TimelineEvent } from '../timelineEvent'
import { getDecodedParamEntries, getTimelineFieldType } from './eventFieldTypes'

const base = {
  id: '1',
  name: 'alice.eth',
  registrationId: null,
  transactionHash: '0xabc',
  blockNumber: 1,
  logIndex: 0,
  timestamp: 1,
} as const

describe('getTimelineFieldType', () => {
  it('returns the type of each served payload field', () => {
    expect(getTimelineFieldType('record', 'key')).toBe('string')
    expect(getTimelineFieldType('expiry', 'fuses')).toBe('uint32')
    expect(getTimelineFieldType('renewal', 'expires_at')).toBe('timestamp')
    expect(getTimelineFieldType('subregistry', 'subregistry')).toBe('address')
    expect(getTimelineFieldType('permission', 'powers')).toBe('string[]')
  })

  it('returns unknown for an unmapped field', () => {
    expect(getTimelineFieldType('record', 'missing')).toBe('unknown')
  })
})

describe('getDecodedParamEntries', () => {
  it('flattens contract pointers to their address and lists to one string', () => {
    const event: TimelineEvent = {
      ...base,
      type: 'registration',
      data: {
        owner: '0x1111111111111111111111111111111111111111',
        resolver: {
          chain_id: 11155111,
          address: '0x2222222222222222222222222222222222222222',
        },
        expires_at: '2027-01-01T00:00:00Z',
      },
    }
    expect(getDecodedParamEntries(event)).toEqual([
      ['owner', '0x1111111111111111111111111111111111111111'],
      ['resolver', '0x2222222222222222222222222222222222222222'],
      ['expires_at', '2027-01-01T00:00:00Z'],
    ])

    const permission: TimelineEvent = {
      ...base,
      type: 'permission',
      data: { powers: ['set_addr', 'set_text'] },
    }
    expect(getDecodedParamEntries(permission)).toEqual([
      ['powers', 'set_addr, set_text'],
    ])
  })

  it('drops empty values', () => {
    const event: TimelineEvent = {
      ...base,
      type: 'record',
      data: { key: 'text:url', value: '' },
    }
    expect(getDecodedParamEntries(event)).toEqual([['key', 'text:url']])
  })

  it('returns nothing for a row with an empty payload', () => {
    const event: TimelineEvent = { ...base, type: 'release', data: {} }
    expect(getDecodedParamEntries(event)).toEqual([])
  })
})
