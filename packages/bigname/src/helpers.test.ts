import { describe, expect, it } from 'vitest'
import { isHistoryEventOfType, isNameProfile } from './guards'
import { hasAnyGrant, hasPower, powersForAddress } from './powers'
import { buildQuery } from './query'
import {
  addrKey,
  getRecordValue,
  isEvmCoinType,
  parseRecordKey,
  textKey,
} from './records'
import { parseTimestamp, secondsToTimestamp, timestampToSeconds } from './time'
import type { HistoryEvent, NameDetail, RoleSummaryEntry } from './types'

describe('buildQuery', () => {
  it('drops absent values and comma-joins lists', () => {
    expect(
      buildQuery({
        a: undefined,
        b: null,
        c: '',
        d: [],
        keys: ['text:avatar', 'addr:60'],
        page_size: 50,
        include_expired: false,
      }),
    ).toBe('?keys=text%3Aavatar%2Caddr%3A60&page_size=50&include_expired=false')
  })

  it('percent-encodes + in timestamps', () => {
    expect(buildQuery({ at: '2025-06-15T17:37:42+02:30' })).toBe(
      '?at=2025-06-15T17%3A37%3A42%2B02%3A30',
    )
  })

  it('returns an empty string when nothing is set', () => {
    expect(buildQuery({ cursor: undefined })).toBe('')
  })
})

describe('record keys', () => {
  it('builds keys', () => {
    expect(textKey('avatar')).toBe('text:avatar')
    expect(addrKey(60)).toBe('addr:60')
    expect(addrKey(2147492101n)).toBe('addr:2147492101')
  })

  it('parses keys in the grammar', () => {
    expect(parseRecordKey('text:com.twitter')).toEqual({
      kind: 'text',
      key: 'com.twitter',
    })
    expect(parseRecordKey('addr:2147483648')).toEqual({
      kind: 'addr',
      coinType: 2147483648,
    })
    expect(parseRecordKey('contenthash')).toEqual({ kind: 'contenthash' })
    expect(parseRecordKey('avatar')).toEqual({ kind: 'avatar' })
  })

  it('rejects keys outside the grammar', () => {
    expect(parseRecordKey('name')).toBeUndefined()
    expect(parseRecordKey('abi:1')).toBeUndefined()
    expect(parseRecordKey('addr:060')).toBeUndefined()
    expect(parseRecordKey('addr:x')).toBeUndefined()
    expect(parseRecordKey('text:')).toBeUndefined()
  })

  it('reads ok values only', () => {
    const records = {
      'addr:60': { status: 'ok', value: '0xb8c2' },
      'text:url': { status: 'not_found' },
    } as const
    expect(getRecordValue(records, 'addr:60')).toBe('0xb8c2')
    expect(getRecordValue(records, 'text:url')).toBeUndefined()
    expect(getRecordValue(records, 'contenthash')).toBeUndefined()
  })

  it('classifies EVM coin types', () => {
    expect(isEvmCoinType(60)).toBe(true)
    expect(isEvmCoinType(2147492101)).toBe(true)
    expect(isEvmCoinType(61)).toBe(false)
    expect(isEvmCoinType(0)).toBe(false)
  })
})

describe('time', () => {
  it('parses Z, numeric offsets and long fractions', () => {
    expect(parseTimestamp('2026-12-30T05:30:33Z')?.toISOString()).toBe(
      '2026-12-30T05:30:33.000Z',
    )
    expect(parseTimestamp('2024-12-11T13:37:24+00:00')?.toISOString()).toBe(
      '2024-12-11T13:37:24.000Z',
    )
    expect(
      parseTimestamp('2025-06-15T17:37:42.123456789+02:30')?.toISOString(),
    ).toBe('2025-06-15T15:07:42.123Z')
  })

  it('handles missing and invalid input', () => {
    expect(parseTimestamp(undefined)).toBeUndefined()
    expect(parseTimestamp(null)).toBeUndefined()
    expect(parseTimestamp('not a date')).toBeUndefined()
  })

  it('converts to and from unix seconds', () => {
    expect(timestampToSeconds('1970-01-01T00:01:40Z')).toBe(100)
    expect(secondsToTimestamp(100)).toBe('1970-01-01T00:01:40Z')
    expect(secondsToTimestamp(100n)).toBe('1970-01-01T00:01:40Z')
  })
})

describe('powers', () => {
  const roleSummary: readonly RoleSummaryEntry[] = [
    {
      address: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
      grants: [
        {
          grant_scope: {
            kind: 'resolver',
            detail: { resolver: { chain_id: 11155111, address: '0xe996' } },
          },
          powers: ['resolver_control'],
        },
        {
          grant_scope: { kind: 'registration', detail: {} },
          powers: ['registration_control', 'resolver_control'],
        },
      ],
    },
  ]
  const holder = '0x5C7B61A99D922E9A4451ED62EBBBEDBF1627AB47'

  it('collects distinct powers case-insensitively', () => {
    expect(powersForAddress(roleSummary, holder)).toEqual([
      'resolver_control',
      'registration_control',
    ])
  })

  it('answers grant and power checks', () => {
    expect(hasAnyGrant(roleSummary, holder)).toBe(true)
    expect(hasAnyGrant(roleSummary, '0x0000')).toBe(false)
    expect(hasAnyGrant(undefined, holder)).toBe(false)
    expect(hasPower(roleSummary, holder, 'registration_control')).toBe(true)
    expect(hasPower(roleSummary, holder, 'transfer')).toBe(false)
  })
})

describe('guards', () => {
  it('narrows name detail on status', () => {
    const unsupported: NameDetail = {
      name: 'x.eth',
      display_name: 'x.eth',
      namespace: 'ens',
      namehash: '0x01',
      status: 'unsupported',
      unsupported_reason: 'current_authority_not_projected',
    }
    expect(isNameProfile(unsupported)).toBe(false)
    expect(isNameProfile({ ...unsupported, status: 'ok' })).toBe(true)
  })

  it('narrows history rows to a type', () => {
    const event: HistoryEvent = {
      id: 'id',
      type: 'record',
      name: 'nick.eth',
      namespace: 'ens',
      registration_id: null,
      block_number: 1,
      timestamp: '2026-01-01T00:00:00Z',
      transaction_hash: '0x01',
      log_index: 0,
      data: { key: 'addr:60', coin_type: 60, value: '0xabc' },
    }
    expect(isHistoryEventOfType(event, 'record')).toBe(true)
    if (isHistoryEventOfType(event, 'record')) {
      expect(event.data?.key).toBe('addr:60')
    }
    expect(isHistoryEventOfType(event, 'transfer')).toBe(false)
  })
})
