import { describe, expect, it } from 'vitest'
import {
  getV1GraceRenewalDurationSeconds,
  V1_GRACE_RENEWAL_BUFFER_DAYS,
} from './graceRenewal'

describe('getV1GraceRenewalDurationSeconds', () => {
  it('returns grace debt plus the fixed one week buffer', () => {
    const expiry = new Date('2026-01-01T00:00:00.000Z')
    const now = new Date('2026-01-04T12:00:00.000Z')

    expect(getV1GraceRenewalDurationSeconds(expiry, now)).toBe(
      3.5 * 24 * 60 * 60 + V1_GRACE_RENEWAL_BUFFER_DAYS * 24 * 60 * 60,
    )
  })

  it('rounds partial seconds up so renewal clears grace', () => {
    const expiry = new Date('2026-01-01T00:00:00.500Z')
    const now = new Date('2026-01-01T00:00:01.001Z')

    expect(getV1GraceRenewalDurationSeconds(expiry, now)).toBe(
      1 + V1_GRACE_RENEWAL_BUFFER_DAYS * 24 * 60 * 60,
    )
  })
})
