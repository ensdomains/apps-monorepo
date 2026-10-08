import { describe, expect, it } from 'vitest'
import { isInV2Grace, V2_GRACE_SECONDS } from './grace'
import type { AddressName } from './types'

const OWNER = '0x1111111111111111111111111111111111111111'
const NOW = 1_800_000_000n

const lapsed = (overrides: Partial<AddressName> = {}): AddressName => ({
  name: 'grace.eth',
  display_name: 'grace.eth',
  namespace: 'ens',
  namehash: '0x01',
  registration_status: 'released',
  authority: 'ens_v2',
  expires_at: String(NOW - 86_400n),
  relations: ['former_owner'],
  is_primary: false,
  lapsed_registration: { owner: OWNER, release_kind: 'expired' },
  ...overrides,
})

describe('isInV2Grace', () => {
  it('holds an expired ENSv2 .eth name for its former owner until grace ends', () => {
    expect(isInV2Grace(lapsed(), OWNER.toUpperCase(), NOW)).toBe(true)
    expect(
      isInV2Grace(
        lapsed({ expires_at: String(NOW - V2_GRACE_SECONDS + 1n) }),
        OWNER,
        NOW,
      ),
    ).toBe(true)
    expect(
      isInV2Grace(
        lapsed({ expires_at: String(NOW - V2_GRACE_SECONDS) }),
        OWNER,
        NOW,
      ),
    ).toBe(false)
  })

  it('does not hold another holder’s, an ENSv1, a subname or an unexpired name', () => {
    expect(
      isInV2Grace(lapsed(), '0x2222222222222222222222222222222222222222', NOW),
    ).toBe(false)
    expect(isInV2Grace(lapsed({ authority: 'ens_v1' }), OWNER, NOW)).toBe(false)
    expect(isInV2Grace(lapsed({ name: 'sub.grace.eth' }), OWNER, NOW)).toBe(
      false,
    )
    expect(
      isInV2Grace(lapsed({ expires_at: String(NOW + 1n) }), OWNER, NOW),
    ).toBe(false)
  })
})
