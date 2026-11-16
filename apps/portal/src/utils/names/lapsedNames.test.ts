import type { AddressName } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { isLapsedName } from './lapsedNames'

const ADDRESS = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const NOW = 1_800_000_000n
const DAY = 86_400n

const lapsed = (overrides: Partial<AddressName> = {}): AddressName => ({
  name: 'lapsed.eth',
  display_name: 'lapsed.eth',
  namespace: 'ens',
  namehash: '0x01',
  status: 'released',
  authority: 'ens_v2',
  expires_at: String(NOW - 29n * DAY),
  grace_ends_at: String(NOW - DAY),
  relations: ['former_owner'],
  is_primary: false,
  lapsed_registration: { owner: ADDRESS, release_kind: 'expired' },
  ...overrides,
})

describe('isLapsedName', () => {
  it.each([
    ['an ENSv2 name released 29 days after expiry', lapsed(), true],
    [
      'an ENSv2 name in grace',
      lapsed({
        status: 'expired',
        expires_at: String(NOW - DAY),
        grace_ends_at: String(NOW + 27n * DAY),
      }),
      true,
    ],
    [
      'an ENSv2 name 30 days after expiry',
      lapsed({
        expires_at: String(NOW - 30n * DAY),
        grace_ends_at: String(NOW - 2n * DAY),
      }),
      false,
    ],
    // The top-level expiry is the ENSv2 reservation, 62 days after the lease;
    // the list counts from the lease.
    [
      'a reserved ENSv1 name 91 days after its lease expiry',
      lapsed({
        authority: 'ens_v1',
        ens_v1: { expires_at: String(NOW - 91n * DAY) },
      }),
      false,
    ],
    [
      'a name registered again by someone else',
      lapsed({
        status: 'active',
        owner: OTHER,
        expires_at: String(NOW + 300n * DAY),
        grace_ends_at: String(NOW + 328n * DAY),
      }),
      false,
    ],
    [
      'a name another address let expire',
      lapsed({
        lapsed_registration: { owner: OTHER, release_kind: 'expired' },
      }),
      false,
    ],
  ])('%s', (_, row, expected) => {
    expect(isLapsedName(row, ADDRESS, NOW)).toBe(expected)
  })
})
