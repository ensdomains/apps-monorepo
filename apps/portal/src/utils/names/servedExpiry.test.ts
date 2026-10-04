import { describe, expect, it } from 'vitest'
import { servedExpiry } from './servedExpiry'

const DAY = 24 * 60 * 60

describe('servedExpiry', () => {
  it('reads an ENSv1-decided name’s lease, with the 90-day lease grace', () => {
    expect(
      servedExpiry({
        expires_at: String(1_800_000_000 + 62 * DAY),
        grace_ends_at: String(1_800_000_000 + 90 * DAY),
        ens_v1: { expires_at: '1800000000' },
      }),
    ).toEqual({ expiry: 1_800_000_000, graceEndsAt: 1_800_000_000 + 90 * DAY })
  })

  it('reads a name with no lease from the top level', () => {
    expect(
      servedExpiry({
        expires_at: '1800000000',
        grace_ends_at: '1800000000',
        ens_v1: { expires_at: null },
      }),
    ).toEqual({ expiry: 1_800_000_000, graceEndsAt: 1_800_000_000 })
    expect(
      servedExpiry({
        expires_at: '1800000000',
        grace_ends_at: String(1_800_000_000 + 28 * DAY),
      }),
    ).toEqual({ expiry: 1_800_000_000, graceEndsAt: 1_800_000_000 + 28 * DAY })
  })

  it('reads a missing or undatable expiry as none', () => {
    expect(servedExpiry({})).toEqual({ expiry: null, graceEndsAt: null })
    expect(
      servedExpiry({ ens_v1: { expires_at: '9223372036854775807' } }),
    ).toEqual({ expiry: null, graceEndsAt: null })
  })
})
