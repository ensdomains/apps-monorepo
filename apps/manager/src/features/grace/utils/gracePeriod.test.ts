import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GRACE_PERIOD_DAYS,
  getDaysSinceExpiry,
  getDisplayExpiryDate,
  getGraceEndDate,
  isInGracePeriod,
  isPastGracePeriod,
  MS_PER_DAY,
  shouldShowProminentRenew,
  V2_GRACE_PERIOD_DAYS,
} from './gracePeriod'

const base = new Date('2024-06-01T12:00:00Z')

describe('getGraceEndDate', () => {
  it('adds 28 days for v2', () => {
    const end = getGraceEndDate(base, true)
    expect(end.getTime()).toBe(
      base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY,
    )
  })

  it('adds 90 days for v1', () => {
    const end = getGraceEndDate(base, false)
    expect(end.getTime()).toBe(base.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY)
  })
})

describe('isInGracePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false before expiry', () => {
    vi.setSystemTime(base.getTime() - MS_PER_DAY)
    expect(isInGracePeriod(base, true)).toBe(false)
  })

  it('returns true on first day of v2 grace', () => {
    vi.setSystemTime(base.getTime() + MS_PER_DAY)
    expect(isInGracePeriod(base, true)).toBe(true)
  })

  it('returns true on last day of v2 grace', () => {
    vi.setSystemTime(base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY - 1)
    expect(isInGracePeriod(base, true)).toBe(true)
  })

  it('returns false after v2 grace ends', () => {
    vi.setSystemTime(base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY)
    expect(isInGracePeriod(base, true)).toBe(false)
  })

  it('returns true on last day of v1 grace', () => {
    vi.setSystemTime(base.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY - 1)
    expect(isInGracePeriod(base, false)).toBe(true)
  })
})

describe('isPastGracePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false during grace', () => {
    vi.setSystemTime(base.getTime() + MS_PER_DAY)
    expect(isPastGracePeriod(base, true)).toBe(false)
  })

  it('returns true after grace', () => {
    vi.setSystemTime(base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY)
    expect(isPastGracePeriod(base, true)).toBe(true)
  })
})

describe('getDaysSinceExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(base.getTime() + 3 * MS_PER_DAY)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns days since expiry', () => {
    expect(getDaysSinceExpiry(base)).toBe(3)
  })
})

describe('shouldShowProminentRenew', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true when in grace', () => {
    vi.setSystemTime(base.getTime() + MS_PER_DAY)
    expect(shouldShowProminentRenew(base, true)).toBe(true)
  })

  it('returns true within 30 days before expiry', () => {
    vi.setSystemTime(base.getTime() - 10 * MS_PER_DAY)
    expect(shouldShowProminentRenew(base, true)).toBe(true)
  })

  it('returns false more than 30 days before expiry', () => {
    vi.setSystemTime(base.getTime() - 31 * MS_PER_DAY)
    expect(shouldShowProminentRenew(base, true)).toBe(false)
  })
})

describe('getDisplayExpiryDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns grace end when in grace', () => {
    vi.setSystemTime(base.getTime() + MS_PER_DAY)
    const display = getDisplayExpiryDate(base, true)
    expect(display?.getTime()).toBe(getGraceEndDate(base, true).getTime())
  })

  it('returns raw expiry when not in grace', () => {
    vi.setSystemTime(base.getTime() - MS_PER_DAY)
    expect(getDisplayExpiryDate(base, true)?.getTime()).toBe(base.getTime())
  })
})
