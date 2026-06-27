import { describe, expect, it } from 'vitest'
import {
  getV1GraceRenewalDurationSeconds,
  V1_GRACE_RENEWAL_BUFFER_DAYS,
  V1_MIN_RENEWAL_DURATION_SECONDS,
} from './graceRenewal'

describe('getV1GraceRenewalDurationSeconds', () => {
  it('returns the legacy minimum when grace debt plus buffer is shorter', () => {
    const expiry = new Date('2026-01-01T00:00:00.000Z')
    const now = new Date('2026-01-04T12:00:00.000Z')

    expect(getV1GraceRenewalDurationSeconds(expiry, now)).toBe(
      V1_MIN_RENEWAL_DURATION_SECONDS,
    )
  })

  it('returns grace debt plus the fixed one week buffer above the minimum', () => {
    const expiry = new Date('2026-01-01T00:00:00.000Z')
    const now = new Date('2026-02-01T00:00:00.000Z')

    expect(getV1GraceRenewalDurationSeconds(expiry, now)).toBe(
      31 * 24 * 60 * 60 + V1_GRACE_RENEWAL_BUFFER_DAYS * 24 * 60 * 60,
    )
  })

  it('rounds partial seconds up so renewal clears grace', () => {
    const expiry = new Date('2026-01-01T00:00:00.500Z')
    const now = new Date('2026-01-01T00:00:01.001Z')

    expect(getV1GraceRenewalDurationSeconds(expiry, now)).toBe(
      V1_MIN_RENEWAL_DURATION_SECONDS,
    )
  })
})
