import { describe, expect, it } from 'vitest'
import { toDate, toExactSeconds, toExpiresAt, toUnixSeconds } from './adapters'

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

  it('clamps a wrapped name expiry to the largest exact number', () => {
    expect(toUnixSeconds('18446744073709551615')).toBe(Number.MAX_SAFE_INTEGER)
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

describe('toExpiresAt', () => {
  it('uses the ENSv1 lease over the ENSv2 reservation expiry', () => {
    expect(
      toExpiresAt({
        expires_at: '1819268004',
        ens_v1: { expires_at: '1813911204' },
      }),
    ).toEqual(new Date(1813911204 * 1000))
  })

  it('falls back to the top-level expiry when there is no lease', () => {
    expect(
      toExpiresAt({ expires_at: '1819268004', ens_v1: { expires_at: null } }),
    ).toEqual(new Date(1819268004 * 1000))
    expect(toExpiresAt({ expires_at: '1819268004' })).toEqual(
      new Date(1819268004 * 1000),
    )
  })
})

describe('toExactSeconds', () => {
  it('keeps every digit, past what a Date or a number holds', () => {
    expect(toExactSeconds('9223372036854775807')).toBe(
      9_223_372_036_854_775_807n,
    )
    expect(toExactSeconds('18446744073709551615')).toBe(
      18_446_744_073_709_551_615n,
    )
  })

  it('reads RFC 3339 and returns null for anything else', () => {
    expect(toExactSeconds('2026-10-30T22:33:48Z')).toBe(1_793_399_628n)
    expect(toExactSeconds(undefined)).toBeNull()
    expect(toExactSeconds('soon')).toBeNull()
  })
})
