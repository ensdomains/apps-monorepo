import { describe, expect, it } from 'vitest'
import { chain } from '@/config'
import { TOKENS } from '@/lib/tokens'
import {
  mockEventRootPermissionChanged,
  mockHistoryPermissionToken,
  mockHistoryRegistration,
  mockHistoryRegistrationPayment,
  mockHistoryRenewalPayment,
  mockHistoryRootPermission,
  mockHistoryTransferOperator,
} from '@/test-utils/bigname/bigname.mock'
import { type TimelineEvent, toTimelineEvents } from '../timelineEvent'
import { getDecodedParamEntries, getTimelineFieldType } from './eventFieldTypes'

const base = {
  id: '1',
  name: 'alice.eth',
  registrationId: null,
  transactionHash: '0xabc',
  blockNumber: 1,
  logIndex: 0,
  timestamp: 1,
} as const

describe('getTimelineFieldType', () => {
  it('returns the type of each served payload field', () => {
    expect(getTimelineFieldType('record', 'key')).toBe('string')
    expect(getTimelineFieldType('expiry', 'fuses')).toBe('uint32')
    expect(getTimelineFieldType('renewal', 'expires_at')).toBe('timestamp')
    expect(getTimelineFieldType('subregistry', 'subregistry')).toBe('address')
    expect(getTimelineFieldType('permission', 'powers')).toBe('string[]')
  })

  it('returns unknown for an unmapped field, or a type newer than the client', () => {
    expect(getTimelineFieldType('record', 'missing')).toBe('unknown')
    expect(getTimelineFieldType('future_type', 'key')).toBe('unknown')
  })

  it('types the migration payload', () => {
    expect(getTimelineFieldType('migration', 'migration_path')).toBe('string')
  })
})

describe('getDecodedParamEntries', () => {
  it('flattens contract pointers to their address and lists to one string', () => {
    const event: TimelineEvent = {
      ...base,
      type: 'registration',
      data: {
        owner: '0x1111111111111111111111111111111111111111',
        resolver: {
          chain_id: 11155111,
          address: '0x2222222222222222222222222222222222222222',
        },
        expires_at: '1798761600',
      },
    }
    expect(getDecodedParamEntries(event)).toEqual([
      ['owner', '0x1111111111111111111111111111111111111111'],
      ['resolver', '0x2222222222222222222222222222222222222222'],
      ['expires_at', '2027-01-01T00:00:00.000Z'],
    ])

    const permission: TimelineEvent = {
      ...base,
      type: 'permission',
      data: { powers: ['set_addr', 'set_text'] },
    }
    expect(getDecodedParamEntries(permission)).toEqual([
      ['powers', 'set_addr, set_text'],
    ])
  })

  it('adds the token id a BaseRegistrar or NameWrapper row is about', () => {
    const registration: TimelineEvent = {
      ...base,
      name: 'envoy1084.eth',
      type: 'registration',
      kind: 'RegistrationGranted',
      contractAddress: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
      data: { action_role: 'registered' },
    }
    expect(getDecodedParamEntries(registration)).toEqual([
      ['action_role', 'registered'],
      [
        'token_id',
        '85527650159212779790354773742537435044869515479240792704213198141377375979258',
      ],
    ])
    expect(getTimelineFieldType('registration', 'token_id')).toBe('uint256')
    expect(getTimelineFieldType('transfer', 'token_id')).toBe('uint256')
  })

  it('adds no token id to an ENSv2 registry row', () => {
    const transfer: TimelineEvent = {
      ...base,
      type: 'transfer',
      contractAddress: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
      data: { to: '0x00a2895816e64f152ff81c8a931dc1bd9f5c3ce3' },
    }
    expect(getDecodedParamEntries(transfer)).toEqual([
      ['to', '0x00a2895816e64f152ff81c8a931dc1bd9f5c3ce3'],
    ])
  })

  it('drops empty values', () => {
    const event: TimelineEvent = {
      ...base,
      type: 'record',
      data: { key: 'text:url', value: '' },
    }
    expect(getDecodedParamEntries(event)).toEqual([['key', 'text:url']])
  })

  it('returns nothing for a row with an empty payload', () => {
    const event: TimelineEvent = { ...base, type: 'release', data: {} }
    expect(getDecodedParamEntries(event)).toEqual([])
  })
})

/** A decimal Unix-seconds instant as the ISO string the table prints. */
const iso = (seconds: string) => new Date(Number(seconds) * 1000).toISOString()

describe('getDecodedParamEntries', () => {
  const entriesOf = (row: Parameters<typeof toTimelineEvents>[0][number]) =>
    Object.fromEntries(getDecodedParamEntries(toTimelineEvents([row])[0]))

  it('lists an ENSv2 registration with its token, canonical id, charge and referrer', () => {
    const { data } = mockHistoryRegistrationPayment
    const row = {
      ...mockHistoryRegistrationPayment,
      data: {
        ...data,
        payment_token: {
          chain_id: chain.id,
          address: TOKENS.USDC.address.toLowerCase() as `0x${string}`,
        },
      },
    }
    const entries = getDecodedParamEntries(toTimelineEvents([row])[0])
    expect(Object.fromEntries(entries)).toMatchObject({
      token_id: data.token_id,
      canonical_id: data.canonical_id,
      base_cost: '5 USDC',
      premium: '0 USDC',
      payment_token: TOKENS.USDC.address.toLowerCase(),
      referrer: data.referrer,
    })
    // The served token id is listed once, not again as a derived one.
    expect(entries.filter(([key]) => key === 'token_id')).toHaveLength(1)
  })

  it('lists an ENSv1 renewal cost in ETH, with its referrer', () => {
    expect(entriesOf(mockHistoryRenewalPayment)).toEqual({
      expires_at: iso(mockHistoryRenewalPayment.data.expires_at),
      cost: '0.00312500000000349 ETH',
      referrer: mockHistoryRenewalPayment.data.referrer,
    })
  })

  it('lists an ENSv2 transfer with its operator, token and canonical id', () => {
    const { data } = mockHistoryTransferOperator
    expect(entriesOf(mockHistoryTransferOperator)).toEqual({
      token_id: data.token_id,
      canonical_id: data.canonical_id,
      operator: data.operator,
      from: data.from,
      to: data.to,
    })
  })

  it("lists a permission row's own token, the one the change was made on", () => {
    const { data } = mockHistoryPermissionToken
    expect(entriesOf(mockHistoryPermissionToken)).toMatchObject({
      token_id: data.token_id,
      canonical_id: data.canonical_id,
      grant_scope: 'registry',
    })
  })

  it('lists a root role change with its registry', () => {
    const { data } = mockEventRootPermissionChanged
    expect(
      getDecodedParamEntries(
        toTimelineEvents([mockEventRootPermissionChanged])[0],
      ),
    ).toEqual([
      ['address', data.address],
      ['grant_scope', 'root'],
      ['powers', 'registrar'],
      ['added_powers', ''],
      ['removed_powers', 'admin_registrar'],
      ['registry', data.grant_scope.detail.registry.address],
    ])
    expect(getTimelineFieldType('permission', 'registry')).toBe('address')
  })

  it('types the fields served', () => {
    expect(getTimelineFieldType('registration', 'cost')).toBe('uint256')
    expect(getTimelineFieldType('registration', 'base_cost')).toBe('uint256')
    expect(getTimelineFieldType('registration', 'premium')).toBe('uint256')
    expect(getTimelineFieldType('renewal', 'cost')).toBe('uint256')
    expect(getTimelineFieldType('renewal', 'payment_token')).toBe('address')
    expect(getTimelineFieldType('renewal', 'referrer')).toBe('bytes32')
    expect(getTimelineFieldType('transfer', 'operator')).toBe('address')
    expect(getTimelineFieldType('permission', 'token_id')).toBe('uint256')
    for (const type of ['release', 'expiry', 'resolver', 'subregistry'])
      expect(getTimelineFieldType(type, 'canonical_id')).toBe('uint256')
  })

  it('lists rows without the newer fields exactly as served', () => {
    const registration = mockHistoryRegistration.data
    expect(
      getDecodedParamEntries(toTimelineEvents([mockHistoryRegistration])[0]),
    ).toEqual([
      ['action_id', registration.action_id],
      ['action_role', 'linked'],
      ['expires_at', iso(registration.expires_at)],
      ['registrant', registration.registrant],
    ])
    const permission = mockHistoryRootPermission.data
    expect(
      getDecodedParamEntries(toTimelineEvents([mockHistoryRootPermission])[0]),
    ).toEqual([
      ['added_powers', ''],
      ['address', permission.address],
      ['grant_scope', 'registry'],
      ['powers', permission.powers.join(', ')],
      ['removed_powers', permission.removed_powers.join(', ')],
    ])
  })
})
