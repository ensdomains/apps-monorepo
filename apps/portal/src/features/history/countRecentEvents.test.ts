import { describe, expect, it } from 'vitest'
import { countRecentEvents, formatRecentEventCount } from './countRecentEvents'

const DAY = 86_400
const NOW = 1_800_000_000

describe('countRecentEvents', () => {
  it('counts only the events inside the window', () => {
    expect(
      countRecentEvents({
        timestamps: [NOW - DAY, NOW - 10 * DAY, NOW - 31 * DAY],
        nowSeconds: NOW,
        hasMore: true,
      }),
    ).toEqual({ count: 2, isLowerBound: false })
  })

  it('is a lower bound when the whole page is inside the window and more pages exist', () => {
    expect(
      countRecentEvents({
        timestamps: [NOW - DAY, NOW - 2 * DAY],
        nowSeconds: NOW,
        hasMore: true,
      }),
    ).toEqual({ count: 2, isLowerBound: true })
  })

  it('is exact when the page is the last one', () => {
    expect(
      countRecentEvents({
        timestamps: [NOW - DAY],
        nowSeconds: NOW,
        hasMore: false,
      }),
    ).toEqual({ count: 1, isLowerBound: false })
  })

  it('formats a lower bound with a plus and an unknown count as a dash', () => {
    expect(formatRecentEventCount({ count: 4, isLowerBound: true })).toBe('4+')
    expect(formatRecentEventCount({ count: 0, isLowerBound: false })).toBe('0')
    expect(formatRecentEventCount(null)).toBe('—')
  })
})
