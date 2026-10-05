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

  it('returns unknown for an unmapped field, or a type newer than the client', () => {
    expect(getTimelineFieldType('record', 'missing')).toBe('unknown')
    expect(getTimelineFieldType('future_type', 'key')).toBe('unknown')
  })

  it('types the migration payload', () => {
    expect(getTimelineFieldType('migration', 'migration_path')).toBe('string')
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
        expires_at: '1798761600',
      },
    }
    expect(getDecodedParamEntries(event)).toEqual([
      ['owner', '0x1111111111111111111111111111111111111111'],
      ['resolver', '0x2222222222222222222222222222222222222222'],
      ['expires_at', '2027-01-01T00:00:00.000Z'],
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

  it('adds the token id a BaseRegistrar or NameWrapper row is about', () => {
    const registration: TimelineEvent = {
      ...base,
      name: 'envoy1084.eth',
      type: 'registration',
      kind: 'RegistrationGranted',
      contractAddress: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
      data: { action_role: 'registered' },
    }
    expect(getDecodedParamEntries(registration)).toEqual([
      ['action_role', 'registered'],
      [
        'token_id',
        '85527650159212779790354773742537435044869515479240792704213198141377375979258',
      ],
    ])
    expect(getTimelineFieldType('registration', 'token_id')).toBe('uint256')
    expect(getTimelineFieldType('transfer', 'token_id')).toBe('uint256')
  })

  it('adds no token id to an ENSv2 registry row', () => {
    const transfer: TimelineEvent = {
      ...base,
      type: 'transfer',
      contractAddress: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
      data: { to: '0x00a2895816e64f152ff81c8a931dc1bd9f5c3ce3' },
    }
    expect(getDecodedParamEntries(transfer)).toEqual([
      ['to', '0x00a2895816e64f152ff81c8a931dc1bd9f5c3ce3'],
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
