import type { NameHistoryRow } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import {
  mockEventRootPermissionChanged,
  mockHistoryRegistrationPayment,
  mockHistoryRenewalPayment,
  mockHistoryTransferOperator,
} from '@/test-utils/bigname/postV041.mock'
import {
  mockAddressHistoryRecordWithoutName,
  mockHistoryRegistration,
} from '@/test-utils/bigname/v041.mock'
import {
  flattenHistoryData,
  historyEventsToTableEvents,
} from './historyEventsToTableEvents'

const row = (over: Partial<NameHistoryRow>): NameHistoryRow =>
  ({
    id: 'a'.repeat(64),
    type: 'registration',
    name: 'alice.eth',
    namespace: 'ens',
    registration_id: '1',
    block_number: 100,
    timestamp: '1781049606',
    transaction_hash: '0xabc',
    log_index: 3,
    kind: 'RegistrationGranted',
    data: {
      owner: '0x1111111111111111111111111111111111111111',
      resolver: {
        chain_id: 11155111,
        address: '0x2222222222222222222222222222222222222222',
      },
    },
    ...over,
  }) as NameHistoryRow

describe('historyEventsToTableEvents', () => {
  it('keys a row by its log and carries its payload as flat fields', () => {
    expect(historyEventsToTableEvents([row({})])).toEqual([
      {
        id: '0xabc-3',
        transactionID: '0xabc',
        blockNumber: 100,
        type: 'RegistrationGranted',
        timestamp: 1_781_049_606n,
        owner: '0x1111111111111111111111111111111111111111',
        resolver: '0x2222222222222222222222222222222222222222',
      },
    ])
  })

  it('falls back to the friendly type and joins lists', () => {
    const [event] = historyEventsToTableEvents([
      row({
        type: 'permission',
        kind: undefined,
        data: { powers: ['set_addr', 'set_text'] },
      }),
    ])
    expect(event).toMatchObject({
      type: 'permission',
      powers: 'set_addr, set_text',
    })
  })

  it('leaves out a row with no transaction', () => {
    expect(
      historyEventsToTableEvents([row({ transaction_hash: null })]),
    ).toEqual([])
  })
})

/** A decimal Unix-seconds instant as the ISO string the table prints. */
const iso = (seconds: string) => new Date(Number(seconds) * 1000).toISOString()

describe('flattenHistoryData after v0.4.1', () => {
  it('prints an ENSv1 cost in ETH and keeps the referrer as served', () => {
    expect(flattenHistoryData(mockHistoryRenewalPayment.data)).toEqual({
      expires_at: iso(mockHistoryRenewalPayment.data.expires_at),
      cost: '0.00312500000000349 ETH',
      referrer: mockHistoryRenewalPayment.data.referrer,
    })
  })

  it('prints the transfer operator, token and canonical id', () => {
    expect(flattenHistoryData(mockHistoryTransferOperator.data)).toEqual(
      mockHistoryTransferOperator.data,
    )
  })

  it("adds a root role change's registry, which its flattened scope loses", () => {
    const { data } = mockEventRootPermissionChanged
    expect(flattenHistoryData(data)).toEqual({
      address: data.address,
      grant_scope: 'root',
      powers: 'registrar',
      added_powers: '',
      removed_powers: 'admin_registrar',
      registry: data.grant_scope.detail.registry.address,
    })
  })

  it('prints v0.4.1 rows as before, with or without a name', () => {
    expect(flattenHistoryData(mockHistoryRegistration.data)).toEqual({
      ...mockHistoryRegistration.data,
      expires_at: iso(mockHistoryRegistration.data.expires_at),
    })
    expect(
      flattenHistoryData(mockAddressHistoryRecordWithoutName.data),
    ).toEqual({
      ...mockAddressHistoryRecordWithoutName.data,
      resolver: mockAddressHistoryRecordWithoutName.data.resolver.address,
    })
    expect(flattenHistoryData(undefined)).toEqual({})
  })
})

describe('historyEventsToTableEvents after v0.4.1', () => {
  it("prints one registration's charge on one of its rows", () => {
    const registered = mockHistoryRegistrationPayment
    const linked = {
      ...registered,
      id: 'b'.repeat(64),
      log_index: 43,
      data: { ...registered.data, action_role: 'linked' },
    } as const satisfies NameHistoryRow
    const [first, second] = historyEventsToTableEvents([registered, linked])
    expect(first).toHaveProperty('base_cost')
    expect(first).toHaveProperty(
      'payment_token',
      registered.data.payment_token.address,
    )
    expect(second).not.toHaveProperty('base_cost')
    expect(second).not.toHaveProperty('premium')
    expect(second).not.toHaveProperty('payment_token')
    expect(second).toHaveProperty('token_id', registered.data.token_id)
  })
})
