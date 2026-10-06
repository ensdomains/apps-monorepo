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
    ['missing a timezone', '2026-10-30T22:33:48'],
  ])('returns null when %s', (_label, value) => {
    expect(toUnixSeconds(value)).toBeNull()
  })

  it('keeps a wrapped name expiry beyond what a Date can hold', () => {
    expect(toUnixSeconds('18446744073709551615')).toBeGreaterThan(1e19)
  })
})

describe('toDate', () => {
  it('reads unix seconds as a valid date', () => {
    expect(toDate('1793399628')).toEqual(new Date('2026-10-30T22:33:48Z'))
  })

  it('keeps fractional seconds', () => {
    expect(toDate('2026-10-30T22:33:48.500Z')?.getTime()).toBe(
      1_793_399_628_500,
    )
  })

  it('reads an offset as the same instant', () => {
    expect(toDate('2026-10-31T00:33:48+02:00')).toEqual(
      new Date('2026-10-30T22:33:48Z'),
    )
  })

  it('returns null instead of an Invalid Date', () => {
    expect(toDate('soon')).toBeNull()
    expect(toDate('9'.repeat(20))).toBeNull()
  })
})
