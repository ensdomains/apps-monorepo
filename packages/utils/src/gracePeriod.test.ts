import { describe, expect, it } from 'vitest'
import {
  daysUntilDate,
  getGraceEndDate,
  getNameLifecycleState,
  gracePeriodDaysFor,
  MS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from './gracePeriod'

const expiryDate = new Date('2026-06-01T12:00:00Z')

describe('grace period helpers', () => {
  it('uses the protocol grace windows', () => {
    expect(gracePeriodDaysFor('v1')).toBe(V1_GRACE_PERIOD_DAYS)
    expect(gracePeriodDaysFor('v2')).toBe(V2_GRACE_PERIOD_DAYS)
    expect(getGraceEndDate(expiryDate, 'v2').getTime()).toBe(
      expiryDate.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY,
    )
  })

  it('classifies the v2 lifecycle boundaries', () => {
    expect(
      getNameLifecycleState(
        expiryDate,
        'v2',
        new Date(expiryDate.getTime() - 1),
      ),
    ).toBe('expiring')
    expect(getNameLifecycleState(expiryDate, 'v2', expiryDate)).toBe('grace')
    expect(
      getNameLifecycleState(
        expiryDate,
        'v2',
        new Date(expiryDate.getTime() + V2_GRACE_PERIOD_DAYS * MS_PER_DAY),
      ),
    ).toBe('premium')
  })

  it('rounds partial remaining days up', () => {
    expect(
      daysUntilDate(
        expiryDate,
        new Date(expiryDate.getTime() - 1.2 * MS_PER_DAY),
      ),
    ).toBe(2)
  })
})
