import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { getGraceEndDate, MS_PER_DAY } from '@ens-apps/utils/gracePeriod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { getNameExpiryPresentation } from './name-expiry.presentation'

const now = new Date('2026-02-11T12:00:00Z')
const expiryDate = new Date('2026-03-13T12:00:00Z')

const payload = (
  overrides: Partial<PersonalNotificationPayloads['name-expiry']> = {},
): PersonalNotificationPayloads['name-expiry'] => ({
  name: 'alice.eth',
  expiryDate: expiryDate.getTime(),
  protocol: 'v2',
  stage: 'expiry-7d',
  watchReason: 'owned',
  ...overrides,
})

describe('getNameExpiryPresentation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('routes pre-expiry names to renew', () => {
    const presentation = getNameExpiryPresentation(
      payload({ stage: 'expiry-7d' }),
      now,
    )

    expect(presentation.action).toBe('renew')
    expect(presentation.actionLabel).toBe('Renew Now')
    expect(presentation.renewTo).toBe('/renew/$name')
    expect(presentation.description).toContain('expiring soon')
  })

  it('routes grace-start to renew and shows the grace deadline', () => {
    vi.setSystemTime(expiryDate)
    const presentation = getNameExpiryPresentation(
      payload({
        expiryDate: expiryDate.getTime(),
        stage: 'grace-start',
      }),
      expiryDate,
    )
    const graceEnd = getGraceEndDate(expiryDate, 'v2')

    expect(presentation.action).toBe('renew')
    expect(presentation.description).toContain(formatDashboardDate(graceEnd))
    expect(presentation.statusText.startsWith('Grace ends')).toBe(true)
  })

  it('keeps renew during the middle of v2 grace', () => {
    const midGrace = new Date(expiryDate.getTime() + 10 * MS_PER_DAY)
    const presentation = getNameExpiryPresentation(
      payload({
        expiryDate: expiryDate.getTime(),
        stage: 'grace-start',
      }),
      midGrace,
    )

    expect(presentation.action).toBe('renew')
    expect(presentation.description).toContain(
      'expired but can still be renewed',
    )
  })

  it('keeps renew on grace-1d', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const grace1d = new Date(graceEnd.getTime() - MS_PER_DAY)
    const presentation = getNameExpiryPresentation(
      payload({
        expiryDate: expiryDate.getTime(),
        stage: 'grace-1d',
      }),
      grace1d,
    )

    expect(presentation.action).toBe('renew')
    expect(presentation.actionLabel).toBe('Renew Now')
  })

  it('does not treat past-grace names as still in grace', () => {
    const graceEnd = getGraceEndDate(expiryDate, 'v2')
    const presentation = getNameExpiryPresentation(
      payload({
        expiryDate: expiryDate.getTime(),
        stage: 'premium-start',
      }),
      graceEnd,
    )

    expect(presentation.action).toBe('register')
    expect(presentation.actionLabel).toBe('Register Name')
    expect(presentation.description).toContain('past its grace period')
    expect(presentation.statusText).toBe('Grace period ended')
  })

  it('does not route to registration when expiryDate is in the past but still in grace', () => {
    const stillInGrace = new Date(expiryDate.getTime() + MS_PER_DAY)
    const presentation = getNameExpiryPresentation(
      payload({
        expiryDate: expiryDate.getTime(),
        stage: 'grace-start',
      }),
      stillInGrace,
    )

    expect(stillInGrace.getTime()).toBeGreaterThan(expiryDate.getTime())
    expect(presentation.action).toBe('renew')
    expect(presentation.action).not.toBe('register')
  })
})
