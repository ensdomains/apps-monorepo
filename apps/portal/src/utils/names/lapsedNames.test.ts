import type { NameSummary } from '@ens-apps/indexer/reads'
import { describe, expect, it } from 'vitest'
import { isLapsedName } from './lapsedNames'

const NOW = new Date(1_800_000_000_000)
const DAY_MS = 86_400_000

const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY_MS)

const lapsed = (overrides: Partial<NameSummary> = {}): NameSummary => ({
  name: 'lapsed.eth',
  displayName: 'lapsed.eth',
  namehash: '0x01',
  protocol: 'v2',
  relations: [],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'released',
  expiresAt: daysFromNow(-29),
  servedExpiry: null,
  graceEndsAt: daysFromNow(-1),
  registeredAt: null,
  createdAt: null,
  ...overrides,
})

describe('isLapsedName', () => {
  it.each([
    ['an ENSv2 name released 29 days after expiry', lapsed(), true],
    [
      'an ENSv2 name in grace',
      lapsed({
        registrationStatus: 'expired',
        expiresAt: daysFromNow(-1),
        graceEndsAt: daysFromNow(27),
      }),
      true,
    ],
    [
      'an ENSv2 name 30 days after expiry',
      lapsed({ expiresAt: daysFromNow(-30), graceEndsAt: daysFromNow(-2) }),
      false,
    ],
    // A reserved ENSv1 name counts from its lease, not its reservation 62 days later.
    [
      'a reserved ENSv1 name 10 days after its lease',
      lapsed({
        protocol: 'v1',
        expiresAt: daysFromNow(-10),
        servedExpiry: BigInt(Math.floor(daysFromNow(52).getTime() / 1000)),
      }),
      true,
    ],
    [
      'a reserved ENSv1 name 91 days after its lease',
      lapsed({
        protocol: 'v1',
        expiresAt: daysFromNow(-91),
        servedExpiry: BigInt(Math.floor(daysFromNow(-29).getTime() / 1000)),
      }),
      false,
    ],
    [
      'a name registered again by someone else',
      lapsed({
        registrationStatus: 'active',
        expiresAt: daysFromNow(300),
        graceEndsAt: daysFromNow(328),
      }),
      false,
    ],
    [
      'a name whose label the indexer has no text for',
      lapsed({ name: `[${'0'.repeat(64)}].eth` }),
      false,
    ],
  ])('%s', (_, summary, expected) => {
    expect(isLapsedName(summary, NOW)).toBe(expected)
  })
})
