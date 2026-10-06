import { describe, expect, it } from 'vitest'
import { toDate, toUnixSeconds } from './adapters'

describe('toUnixSeconds', () => {
  it.each([
    ['unix seconds, as the API sends them', '1793399628', 1793399628],
    ['RFC 3339, as the docs describe', '2026-10-30T22:33:48Z', 1793399628],
    [
      'RFC 3339 with fractional seconds',
      '2026-10-30T22:33:48.500Z',
      1793399628,
    ],
  ])('parses %s', (_label, value, expected) => {
    expect(toUnixSeconds(value)).toBe(expected)
  })

  it.each([
    ['absent', undefined],
    ['unparseable', 'soon'],
    ['empty', ''],
  ])('returns null when %s', (_label, value) => {
    expect(toUnixSeconds(value)).toBeNull()
  })
})

describe('toDate', () => {
  it('reads unix seconds as a valid date', () => {
    expect(toDate('1793399628')).toEqual(new Date('2026-10-30T22:33:48Z'))
  })

  it('returns null instead of an Invalid Date', () => {
    expect(toDate('soon')).toBeNull()
  })
})
