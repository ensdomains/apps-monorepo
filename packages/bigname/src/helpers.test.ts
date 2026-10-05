import { describe, expect, it } from 'vitest'
import { isHistoryEventOfType, isNameProfile } from './guards'
import {
  mockEnsV1LapsedWrapper,
  mockEnsV1WrapperNoExpiry,
  mockEventRootPermissionChanged,
  mockHistoryPermissionToken,
  mockHistoryRegistrationPayment,
  mockNameWrapperExpiry,
  mockNameWrapperExpiryNotSet,
  mockPermissionsRegistryRoot,
} from './postV041.mock'
import { hasAnyGrant, hasPower, powersForAddress } from './powers'
import { buildQuery } from './query'
import {
  addrKey,
  getRecordValue,
  isEvmCoinType,
  parseRecordKey,
  textKey,
} from './records'
import {
  parseTimestamp,
  readWrapperExpiry,
  secondsToTimestamp,
  timestampToBigInt,
  timestampToSeconds,
} from './time'
import type {
  EnsV1,
  EventRow,
  GrantScope,
  HistoryEvent,
  LookupResult,
  NameDetail,
  RoleSummaryEntry,
} from './types'
import {
  mockAddressHistoryRecordWithoutName,
  mockHistoryMigration,
  mockHistoryRootPermission,
  mockLookupDetailFox,
  mockNameNick,
  mockNameWrappedSub,
  mockPermissionsNick,
} from './v041.mock'

describe('buildQuery', () => {
  it('drops absent values and comma-joins lists', () => {
    expect(
      buildQuery({
        a: undefined,
        b: null,
        c: '',
        d: [],
        keys: ['text:avatar', 'addr:60'],
        page_size: 50,
        include_expired: false,
      }),
    ).toBe('?keys=text%3Aavatar%2Caddr%3A60&page_size=50&include_expired=false')
  })

  it('serializes bigint and Date values', () => {
    expect(
      buildQuery({
        expires_after: 18446744073709551614n,
        at: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toBe(
      '?expires_after=18446744073709551614&at=2026-01-01T00%3A00%3A00.000Z',
    )
  })

  it('percent-encodes + in timestamps', () => {
    expect(buildQuery({ at: '2025-06-15T17:37:42+02:30' })).toBe(
      '?at=2025-06-15T17%3A37%3A42%2B02%3A30',
    )
  })

  it('returns an empty string when nothing is set', () => {
    expect(buildQuery({ cursor: undefined })).toBe('')
  })
})

describe('record keys', () => {
  it('builds keys', () => {
    expect(textKey('avatar')).toBe('text:avatar')
    expect(addrKey(60)).toBe('addr:60')
    expect(addrKey(2147492101n)).toBe('addr:2147492101')
  })

  it('parses keys in the grammar', () => {
    expect(parseRecordKey('text:com.twitter')).toEqual({
      kind: 'text',
      key: 'com.twitter',
    })
    expect(parseRecordKey('addr:2147483648')).toEqual({
      kind: 'addr',
      coinType: 2147483648,
    })
    expect(parseRecordKey('contenthash')).toEqual({ kind: 'contenthash' })
    expect(parseRecordKey('avatar')).toEqual({ kind: 'avatar' })
  })

  it('rejects keys outside the grammar', () => {
    expect(parseRecordKey('name')).toBeUndefined()
    expect(parseRecordKey('abi:1')).toBeUndefined()
    expect(parseRecordKey('addr:060')).toBeUndefined()
    expect(parseRecordKey('addr:x')).toBeUndefined()
    expect(parseRecordKey('text:')).toBeUndefined()
  })

  it('reads ok values only', () => {
    const records = {
      'addr:60': { status: 'ok', value: '0xb8c2' },
      'text:url': { status: 'not_found' },
    } as const
    expect(getRecordValue(records, 'addr:60')).toBe('0xb8c2')
    expect(getRecordValue(records, 'text:url')).toBeUndefined()
    expect(getRecordValue(records, 'contenthash')).toBeUndefined()
  })

  it('classifies EVM coin types', () => {
    expect(isEvmCoinType(60)).toBe(true)
    expect(isEvmCoinType(2147492101)).toBe(true)
    expect(isEvmCoinType(61)).toBe(false)
    expect(isEvmCoinType(0)).toBe(false)
  })
})

describe('time', () => {
  it('parses decimal Unix seconds', () => {
    expect(parseTimestamp('1803965433')?.toISOString()).toBe(
      '2027-03-02T05:30:33.000Z',
    )
    expect(parseTimestamp('0')?.getTime()).toBe(0)
    expect(timestampToSeconds('1803965433')).toBe(1803965433)
    expect(timestampToBigInt('1803965433')).toBe(1803965433n)
  })

  it('reads every served timestamp in a real v0.4.1 response', () => {
    const detail = mockNameNick.data
    expect(timestampToSeconds(detail.expires_at)).toBe(1803965433)
    expect(timestampToSeconds(detail.grace_ends_at)).toBe(1806384633)
    expect(timestampToSeconds(detail.ens_v1.expires_at)).toBe(1798608633)
    expect(timestampToSeconds(detail.registered_at)).toBe(1733924244)
    expect(
      parseTimestamp(mockNameNick.meta.as_of['11155111'].timestamp),
    ).toBeInstanceOf(Date)
    expect(timestampToSeconds(mockHistoryMigration.timestamp)).toBe(1790947464)
  })

  it('keeps finite expiries beyond 2^53 exact as bigint only', () => {
    expect(timestampToBigInt('18446744073709551614')).toBe(
      18446744073709551614n,
    )
    expect(timestampToSeconds('18446744073709551614')).toBeUndefined()
    expect(parseTimestamp('18446744073709551614')).toBeUndefined()
    expect(timestampToSeconds(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })

  it('treats null expiry, missing and malformed values as undefined', () => {
    expect(parseTimestamp(mockNameWrappedSub.expires_at)).toBeUndefined()
    expect(timestampToSeconds(undefined)).toBeUndefined()
    expect(timestampToBigInt(null)).toBeUndefined()
    // RFC 3339 is an accepted input, never an output, since bigname v0.1.0.
    expect(parseTimestamp('2026-12-30T05:30:33Z')).toBeUndefined()
    expect(timestampToSeconds('1.5')).toBeUndefined()
    expect(timestampToSeconds('-1')).toBeUndefined()
    expect(timestampToSeconds('0100')).toBeUndefined()
  })

  it('formats seconds as the decimal string bigname accepts', () => {
    expect(secondsToTimestamp(100)).toBe('100')
    expect(secondsToTimestamp(100.9)).toBe('100')
    expect(secondsToTimestamp(18446744073709551614n)).toBe(
      '18446744073709551614',
    )
    expect(secondsToTimestamp(new Date('2026-10-05T00:00:00.750Z'))).toBe(
      '1791158400',
    )
    expect(() => secondsToTimestamp(Number.NaN)).toThrow(RangeError)
  })
})

describe('readWrapperExpiry', () => {
  it('reads a finite expiry as exact seconds', () => {
    expect(readWrapperExpiry(mockNameWrapperExpiry.ens_v1)).toEqual({
      expiresAt: 1806384633n,
    })
    expect(readWrapperExpiry(mockEnsV1LapsedWrapper)).toEqual({
      expiresAt: 1759000000n,
    })
    expect(
      readWrapperExpiry({ wrapper_expires_at: '18446744073709551614' }),
    ).toEqual({ expiresAt: 18446744073709551614n })
  })

  it('keeps the reason of a classified absent expiry', () => {
    expect(readWrapperExpiry(mockNameWrapperExpiryNotSet.ens_v1)).toEqual({
      expiresAt: null,
      reason: 'not_set',
    })
    expect(readWrapperExpiry(mockEnsV1WrapperNoExpiry)).toEqual({
      expiresAt: null,
      reason: 'no_expiry',
    })
  })

  it('reads wrapper restrictions the same way', () => {
    expect(readWrapperExpiry(mockPermissionsNick.restrictions)).toEqual({
      expiresAt: 1806384633n,
    })
  })

  it('is undefined when the field is not served (v0.4.1 ens_v1) or malformed', () => {
    const served: EnsV1 = mockNameNick.data.ens_v1
    expect(readWrapperExpiry(served)).toBeUndefined()
    expect(readWrapperExpiry(undefined)).toBeUndefined()
    expect(readWrapperExpiry(null)).toBeUndefined()
    expect(readWrapperExpiry({ wrapper_expires_at: null })).toBeUndefined()
    expect(
      readWrapperExpiry({ wrapper_expires_at: '2026-12-30T05:30:33Z' }),
    ).toBeUndefined()
  })
})

describe('powers', () => {
  const roleSummary: readonly RoleSummaryEntry[] = [
    {
      address: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
      grants: [
        {
          grant_scope: {
            kind: 'resolver',
            detail: { resolver: { chain_id: 11155111, address: '0xe996' } },
          },
          powers: ['resolver_control'],
        },
        {
          grant_scope: { kind: 'registration', detail: {} },
          powers: ['registration_control', 'resolver_control'],
        },
      ],
    },
  ]
  const holder = '0x5C7B61A99D922E9A4451ED62EBBBEDBF1627AB47'

  it('collects distinct powers case-insensitively', () => {
    expect(powersForAddress(roleSummary, holder)).toEqual([
      'resolver_control',
      'registration_control',
    ])
  })

  it('answers grant and power checks', () => {
    expect(hasAnyGrant(roleSummary, holder)).toBe(true)
    expect(hasAnyGrant(roleSummary, '0x0000')).toBe(false)
    expect(hasAnyGrant(undefined, holder)).toBe(false)
    expect(hasPower(roleSummary, holder, 'registration_control')).toBe(true)
    expect(hasPower(roleSummary, holder, 'transfer')).toBe(false)
  })
})

describe('guards', () => {
  it('narrows name detail on status', () => {
    const unsupported: NameDetail = {
      name: 'x.eth',
      display_name: 'x.eth',
      namespace: 'ens',
      namehash: '0x01',
      status: 'unsupported',
      unsupported_reason: 'current_authority_not_projected',
    }
    expect(isNameProfile(unsupported)).toBe(false)
    const detail: NameDetail = mockNameNick.data
    expect(isNameProfile(detail)).toBe(true)
    if (isNameProfile(detail)) {
      expect(detail.records?.addresses['60']).toBe(
        '0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5',
      )
    }
  })

  it('narrows lookup detail records', () => {
    const result: LookupResult = mockLookupDetailFox
    expect(result.kind).toBe('name')
    if (
      result.kind === 'name' &&
      result.record &&
      isNameProfile(result.record)
    ) {
      expect(result.record.authority).toBe('ens_v2')
      expect(result.record.ens_v1).toBeUndefined()
    }
  })

  it('narrows name history rows to a type', () => {
    const event: HistoryEvent = mockHistoryMigration
    expect(isHistoryEventOfType(event, 'migration')).toBe(true)
    if (isHistoryEventOfType(event, 'migration')) {
      expect(event.data?.migration_path).toBe('unlocked_wrapped')
    }
    expect(isHistoryEventOfType(event, 'transfer')).toBe(false)
  })

  it('narrows event rows, which may lack a name', () => {
    const event: EventRow = mockAddressHistoryRecordWithoutName
    expect(event.name).toBeUndefined()
    expect(isHistoryEventOfType(event, 'record')).toBe(true)
    if (isHistoryEventOfType(event, 'record')) {
      expect(event.data?.record_id).toBe('5')
      expect(event.data?.key).toBe('text:avatar')
    }
  })

  it('types ENSv2 role changes as permission rows with added/removed powers', () => {
    const event: EventRow = mockHistoryRootPermission
    expect(event.kind).toBe('PermissionChanged')
    if (isHistoryEventOfType(event, 'permission')) {
      expect(event.data?.grant_scope?.kind).toBe('registry')
      expect(event.data?.added_powers).toEqual([])
      expect(event.data?.removed_powers).toContain('admin_registrar')
    }
  })

  it('types registry root role changes as permission rows without a name', () => {
    const event: EventRow = mockEventRootPermissionChanged
    expect(event.name).toBeUndefined()
    expect(event.registration_id).toBeNull()
    expect(event.kind).toBe('RootPermissionChanged')
    if (isHistoryEventOfType(event, 'permission')) {
      const scope = event.data?.grant_scope
      expect(scope?.kind === 'root' && scope.detail.registry?.address).toBe(
        event.contract_address,
      )
      expect(event.data?.removed_powers).toEqual(['admin_registrar'])
      expect(event.data?.token_id).toBeUndefined()
    }
  })

  it('reads the registry of a root scope, absent on v0.4.1', () => {
    const [row] = mockPermissionsRegistryRoot.data
    const scope: GrantScope = row.grant_scope
    expect(scope.kind === 'root' && scope.detail.registry?.chain_id).toBe(
      11155111,
    )
    const v041Scope: GrantScope = { kind: 'root', detail: {} }
    expect(
      v041Scope.kind === 'root' && v041Scope.detail.registry,
    ).toBeUndefined()
  })

  it('types event-time token and payment data per history type', () => {
    const registration: HistoryEvent = mockHistoryRegistrationPayment
    if (isHistoryEventOfType(registration, 'registration')) {
      expect(registration.data?.base_cost).toBe('5000000')
      expect(registration.data?.payment_token?.chain_id).toBe(11155111)
      expect(registration.data?.cost).toBeUndefined()
    }
    const permission: HistoryEvent = mockHistoryPermissionToken
    if (isHistoryEventOfType(permission, 'permission')) {
      const { token_id: tokenId, canonical_id: canonicalId } =
        permission.data ?? {}
      expect(BigInt(tokenId ?? 0) & ~0xffffffffn).toBe(BigInt(canonicalId ?? 1))
    }
    const migration: HistoryEvent = mockHistoryMigration
    if (isHistoryEventOfType(migration, 'migration')) {
      // @ts-expect-error migration rows carry no token or payment data
      expect(migration.data?.token_id).toBeUndefined()
    }
  })
})
