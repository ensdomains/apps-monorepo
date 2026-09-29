import { describe, expect, it } from 'vitest'
import { formatFuseExpiry } from './formatFuseExpiry'

describe('formatFuseExpiry', () => {
  // WEB-1330: `test.eth` rendered as `Nov 20, 59781` because this millisecond
  // value was scaled by 1000 again. It is Oct 2027. Asserted loosely: the suite
  // pins no timezone, so the day can shift either side of the UTC instant.
  it('reads ensjs milliseconds without rescaling them', () => {
    expect(formatFuseExpiry(1824366960000n)).toMatch(/Oct \d+, 2027/)
  })

  // Only ROOT_NODE and ETH_NODE get MAX_EXPIRY; as a date it is unreadable.
  it('reports the uint64-max sentinel as never expiring', () => {
    expect(formatFuseExpiry((2n ** 64n - 1n) * 1000n)).toBe('Never')
  })

  // ensjs maps an on-chain expiry of 0 — a name that was never emancipated — to
  // null, which has no date to show at all.
  it('has nothing to show for an unset expiry', () => {
    expect(formatFuseExpiry(null)).toBeNull()
  })
})
