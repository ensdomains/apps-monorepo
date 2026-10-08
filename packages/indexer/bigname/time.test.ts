import { describe, expect, it } from 'vitest'
import { parseRecordKey } from './recordKeys'
import {
  parseTimestamp,
  secondsToTimestamp,
  timestampToBigInt,
  timestampToSeconds,
} from './time'

describe('timestamps', () => {
  it('reads decimal unix seconds exactly, as a number only while it is safe', () => {
    expect(timestampToBigInt('9223372036854775807')).toBe(9223372036854775807n)
    expect(timestampToSeconds('9223372036854775807')).toBeUndefined()
    expect(timestampToSeconds('1790999568')).toBe(1790999568)
    expect(timestampToSeconds('2026-01-01T00:00:00Z')).toBeUndefined()
    expect(timestampToSeconds(null)).toBeUndefined()
  })

  it('reads a Date only within its range, and writes seconds back', () => {
    expect(parseTimestamp('1790999568')).toEqual(new Date(1790999568000))
    expect(parseTimestamp('9223372036854775807')).toBeUndefined()
    expect(secondsToTimestamp(new Date(1790999568900))).toBe('1790999568')
    expect(secondsToTimestamp(5n)).toBe('5')
  })
})

describe('parseRecordKey', () => {
  it('parses each product key and rejects anything else', () => {
    expect(parseRecordKey('text:com.github')).toEqual({
      kind: 'text',
      key: 'com.github',
    })
    expect(parseRecordKey('addr:2147483658')).toEqual({
      kind: 'addr',
      coinType: 2147483658,
    })
    expect(parseRecordKey('avatar')).toEqual({ kind: 'avatar' })
    expect(parseRecordKey('contenthash')).toEqual({ kind: 'contenthash' })
    expect(parseRecordKey('addr:01')).toBeUndefined()
    expect(parseRecordKey('text:')).toBeUndefined()
    expect(parseRecordKey('name')).toBeUndefined()
  })
})
