import { describe, expect, it } from 'vitest'
import {
  isAddressRecordEvent,
  isFuseChange,
  OWNERSHIP_HISTORY_KINDS,
  toHistoryEventTypes,
} from './eventTypes'

describe('toHistoryEventTypes', () => {
  it('leaves an absent scope unnarrowed', () => {
    expect(toHistoryEventTypes(undefined)).toBeUndefined()
  })

  it('keeps bigname types, in canonical order', () => {
    expect(toHistoryEventTypes(['record', 'resolver'])).toEqual([
      'resolver',
      'record',
    ])
  })

  it('narrows to nothing when no entry is a bigname type', () => {
    expect(toHistoryEventTypes(['CommitmentMade', 'NameRegistered'])).toEqual(
      [],
    )
  })
})

describe('isAddressRecordEvent', () => {
  const record = (data: { key?: string }) =>
    ({
      id: 'row',
      name: 'test.eth',
      registrationId: null,
      transactionHash: null,
      blockNumber: 1,
      logIndex: null,
      timestamp: 1,
      type: 'record',
      data,
    }) as const

  it('keeps address records, the name record and resets', () => {
    expect(isAddressRecordEvent(record({ key: 'addr:60' }))).toBe(true)
    expect(isAddressRecordEvent(record({ key: 'addr:2147483658' }))).toBe(true)
    expect(isAddressRecordEvent(record({ key: 'name' }))).toBe(true)
    expect(isAddressRecordEvent(record({}))).toBe(true)
  })

  it('drops other records and other types', () => {
    expect(isAddressRecordEvent(record({ key: 'text:avatar' }))).toBe(false)
    expect(isAddressRecordEvent(record({ key: 'contenthash' }))).toBe(false)
    expect(
      isAddressRecordEvent({ ...record({}), type: 'resolver', data: {} }),
    ).toBe(false)
  })
})

describe('isFuseChange', () => {
  it('reads the nulls bigname sends for the absent half', () => {
    expect(isFuseChange({ fuses: 65_537, powers: null })).toBe(true)
    expect(isFuseChange({ fuses: null, powers: ['resolver_control'] })).toBe(
      false,
    )
    expect(isFuseChange({ fuses: null, powers: null })).toBe(false)
  })
})

describe('OWNERSHIP_HISTORY_KINDS', () => {
  it('keeps fuse changes and leaves role changes out', () => {
    expect(OWNERSHIP_HISTORY_KINDS).toContain('PermissionScopeChanged')
    expect(OWNERSHIP_HISTORY_KINDS).toContain('RegistrationGranted')
    for (const kind of [
      'PermissionChanged',
      'RootPermissionChanged',
      'RolesChanged',
      'EACRolesChanged',
      'AccountPermissionChanged',
    ] as const)
      expect(OWNERSHIP_HISTORY_KINDS).not.toContain(kind)
  })
})
