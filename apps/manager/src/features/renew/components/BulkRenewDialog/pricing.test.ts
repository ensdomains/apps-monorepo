import { describe, expect, it } from 'vitest'
import {
  durationForName,
  formatUsdAmount,
  newExpirySeconds,
  yearsToSeconds,
} from './pricing'
import type { Selection } from './types'

const YEAR = yearsToSeconds(1) // 365.25-day year → 31_557_600s

const preset = (years: number): Selection => ({ kind: 'preset', years })
const custom = (targetMs: number): Selection => ({ kind: 'custom', targetMs })

describe('formatUsdAmount', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(formatUsdAmount(1320)).toBe('$1,320.00')
    expect(formatUsdAmount(0)).toBe('$0.00')
    expect(formatUsdAmount(1234.5)).toBe('$1,234.50')
  })

  it('returns an em dash for non-finite values', () => {
    expect(formatUsdAmount(Number.NaN)).toBe('—')
    expect(formatUsdAmount(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('yearsToSeconds', () => {
  it('converts whole years using the 365.25-day year', () => {
    expect(yearsToSeconds(1)).toBe(31_557_600)
    expect(yearsToSeconds(3)).toBe(94_672_800)
  })
})

describe('durationForName', () => {
  it('returns the preset duration regardless of the name expiry', () => {
    expect(durationForName(preset(1), 1_000)).toBe(YEAR)
    expect(durationForName(preset(3), 999_999)).toBe(YEAR * 3)
  })

  it('returns target-minus-current-expiry for a custom date', () => {
    const expiry = 1_000_000
    const targetMs = (expiry + YEAR) * 1000
    expect(durationForName(custom(targetMs), expiry)).toBe(YEAR)
  })

  it('never returns a negative duration when the target precedes the expiry', () => {
    expect(durationForName(custom(1_000_000 * 1000), 2_000_000)).toBe(0)
  })
})

describe('newExpirySeconds', () => {
  it('adds the preset duration to the current expiry', () => {
    expect(newExpirySeconds(preset(1), 1_000)).toBe(1_000 + YEAR)
  })

  it('uses the shared target date for a custom selection', () => {
    expect(newExpirySeconds(custom(5_000_000_000), 1_000)).toBe(5_000_000)
  })
})
