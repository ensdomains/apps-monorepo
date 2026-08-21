import { describe, expect, it } from 'vitest'
import {
  daysUntilDate,
  GRACE_PERIOD_DAYS,
  getGraceEndDate,
  getNameLifecycleState,
  gracePeriodDaysFor,
  MS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from './gracePeriod'

const base = new Date('2024-06-01T12:00:00Z')

describe('gracePeriodDaysFor', () => {
  it('returns 28 days for v2 and 90 days for v1', () => {
    expect(gracePeriodDaysFor('v2')).toBe(V2_GRACE_PERIOD_DAYS)
    expect(gracePeriodDaysFor('v1')).toBe(V1_GRACE_PERIOD_DAYS)
    expect(GRACE_PERIOD_DAYS).toBe(V1_GRACE_PERIOD_DAYS)
  })
})

describe('getGraceEndDate', () => {
  it('adds 28 days for v2', () => {
    expect(getGraceEndDate(base, 'v2').getTime()).toBe(
      base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY,
    )
  })

  it('adds 90 days for v1', () => {
    expect(getGraceEndDate(base, 'v1').getTime()).toBe(
      base.getTime() + V1_GRACE_PERIOD_DAYS * MS_PER_DAY,
    )
  })
})

describe('getNameLifecycleState', () => {
  it('is expiring before expiry', () => {
    expect(
      getNameLifecycleState(base, 'v2', new Date(base.getTime() - 1)),
    ).toBe('expiring')
  })

  it('enters grace at expiry', () => {
    expect(getNameLifecycleState(base, 'v2', base)).toBe('grace')
  })

  it('stays in v2 grace until grace end', () => {
    const lastMs = base.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY - 1
    expect(getNameLifecycleState(base, 'v2', new Date(lastMs))).toBe('grace')
  })

  it('enters premium at v2 grace end', () => {
    const graceEnd = getGraceEndDate(base, 'v2')
    expect(getNameLifecycleState(base, 'v2', graceEnd)).toBe('premium')
  })
})

describe('daysUntilDate', () => {
  it('rounds up remaining days', () => {
    expect(
      daysUntilDate(base, new Date(base.getTime() - 1.2 * MS_PER_DAY)),
    ).toBe(2)
  })
})
