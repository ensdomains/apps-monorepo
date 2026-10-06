import type { NameDetail } from '@ens-apps/indexer/reads'
import { describe, expect, it, vi } from 'vitest'
import {
  isHeldInIndex,
  toExistenceSignal,
  toTldSupportSignal,
} from './useNameClassification'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

describe('toExistenceSignal', () => {
  it('does not trust stale owner data after an owner refetch fails', () => {
    expect(
      toExistenceSignal({
        isProfileName: true,
        ownerPending: false,
        ownerError: true,
        hasOwner: true,
        indexerPending: false,
        indexerError: false,
        indexerHit: false,
      }),
    ).toEqual({ status: 'unknown' })
  })

  it('trusts a positive source when the other source fails', () => {
    expect(
      toExistenceSignal({
        isProfileName: true,
        ownerPending: false,
        ownerError: true,
        hasOwner: true,
        indexerPending: false,
        indexerError: false,
        indexerHit: true,
      }),
    ).toEqual({ status: 'owned' })
  })
})

describe('toTldSupportSignal', () => {
  it('skips the lookup when TLD support cannot affect the outcome', () => {
    expect(
      toTldSupportSignal({
        isEnabled: false,
        isError: false,
        isDnsSecEnabled: undefined,
      }),
    ).toEqual({ status: 'skipped' })
  })

  it('reports a failed lookup as an error, not unsupported', () => {
    expect(
      toTldSupportSignal({
        isEnabled: true,
        isError: true,
        isDnsSecEnabled: false,
      }),
    ).toEqual({ status: 'error' })
  })

  it('maps a DNSSEC result to supported or unsupported', () => {
    expect(
      toTldSupportSignal({
        isEnabled: true,
        isError: false,
        isDnsSecEnabled: true,
      }),
    ).toEqual({ status: 'supported' })
    expect(
      toTldSupportSignal({
        isEnabled: true,
        isError: false,
        isDnsSecEnabled: false,
      }),
    ).toEqual({ status: 'unsupported' })
  })
})

describe('isHeldInIndex', () => {
  const detail = (
    registrationStatus: NameDetail['registrationStatus'],
  ): NameDetail => ({
    name: 'sub.alice.eth',
    displayName: 'sub.alice.eth',
    namehash: '0x01',
    protocol: 'v2',
    isSupported: registrationStatus !== null,
    owner: null,
    manager: null,
    registrant: null,
    resolver: null,
    registrationStatus,
    expiresAt: null,
    registeredAt: null,
    createdAt: null,
    migratedAt: null,
  })

  it.each([
    ['not indexed', null, false],
    ['not loaded', undefined, false],
    ['unregistered', detail('unregistered'), false],
    ['registered', detail('registered'), true],
    ['wrapped', detail('wrapped'), true],
    ['released', detail('released'), true],
    ['unsupported, with no status', detail(null), true],
  ] as const)('is %s -> %s', (_label, value, expected) => {
    expect(isHeldInIndex(value)).toBe(expected)
  })
})
