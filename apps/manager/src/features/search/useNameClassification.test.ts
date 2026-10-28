import type { NameDetail } from '@ens-apps/indexer/reads'
import { describe, expect, it, vi } from 'vitest'
import {
  isHeldInIndex,
  toExistenceSignal,
  toTldSupportSignal,
  withResolvedRecords,
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

describe('withResolvedRecords', () => {
  const records = (
    overrides: Partial<Parameters<typeof withResolvedRecords>[1]>,
  ) => ({
    isPending: false,
    isError: false,
    hasRecords: false,
    ...overrides,
  })

  it.each([
    ['records resolve', records({ hasRecords: true }), 'owned'],
    ['records are loading', records({ isPending: true }), 'pending'],
    ['the record read fails', records({ isError: true }), 'unknown'],
    ['nothing resolves', records({}), 'unowned'],
  ] as const)('an unowned name when %s is %s', (_label, value, status) => {
    expect(withResolvedRecords({ status: 'unowned' }, value)).toEqual({
      status,
    })
  })

  it('leaves a known owner alone', () => {
    expect(
      withResolvedRecords({ status: 'owned' }, records({ isPending: true })),
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
    graceEndsAt: null,
    registeredAt: null,
    registrationId: null,
    createdAt: null,
    migratedAt: null,
    unresolvableReason: null,
  })

  it.each([
    ['not indexed', null, false],
    ['not loaded', undefined, false],
    ['unregistered', detail('unregistered'), false],
    ['active', detail('active'), true],
    ['expired', detail('expired'), true],
    ['released', detail('released'), true],
    ['unsupported, with no status', detail(null), true],
  ] as const)('is %s -> %s', (_label, value, expected) => {
    expect(isHeldInIndex(value)).toBe(expected)
  })
})
