import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDashboardGraceBanner } from './resolveDashboardGraceBanner'

describe('resolveDashboardGraceBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows primary expired banner when primary is in grace', () => {
    const expired = Math.floor(new Date('2023-12-20T00:00:00Z').getTime() / 1000)
    const graceEnd = new Date('2024-01-17T00:00:00Z')

    const result = resolveDashboardGraceBanner({
      primaryLabel: 'primary.eth',
      primaryGrace: {
        isInGrace: true,
        graceEndDate: graceEnd,
        daysSinceExpiry: 12,
        expiryDate: new Date(expired * 1000),
        displayExpiryDate: graceEnd,
        isPastGrace: false,
      },
      v2Names: [],
      v1Classified: [],
    })

    expect(result).toEqual({
      show: true,
      variant: 'primaryExpired',
      renewName: 'primary.eth',
      graceEndDate: graceEnd,
      daysSinceExpiry: 12,
      isV2: true,
    })
  })

  it('hides banner when primary is not in grace and no other grace names', () => {
    const result = resolveDashboardGraceBanner({
      primaryLabel: 'active.eth',
      primaryGrace: {
        isInGrace: false,
        graceEndDate: null,
        daysSinceExpiry: null,
        expiryDate: new Date('2025-01-01T00:00:00Z'),
        displayExpiryDate: new Date('2025-01-01T00:00:00Z'),
        isPastGrace: false,
      },
      v2Names: [
        {
          name: 'active.eth',
          expiryDate: Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000),
        } as never,
      ],
      v1Classified: [],
    })

    expect(result).toEqual({ show: false })
  })
})
