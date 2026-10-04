import type { HistoryEvent } from '@ens-apps/bigname'
import { describe, expect, it } from 'vitest'
import { historyEventsToSubgraphEvents } from './historyEventsToSubgraphEvents'

const row = (over: Partial<HistoryEvent>): HistoryEvent =>
  ({
    id: 'a'.repeat(64),
    type: 'registration',
    name: 'alice.eth',
    namespace: 'ens',
    registration_id: '1',
    block_number: 100,
    timestamp: '2026-06-10T00:00:06Z',
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
  }) as HistoryEvent

describe('historyEventsToSubgraphEvents', () => {
  it('keys a row by its log and carries its payload as flat fields', () => {
    expect(historyEventsToSubgraphEvents([row({})])).toEqual([
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
    const [event] = historyEventsToSubgraphEvents([
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
      historyEventsToSubgraphEvents([row({ transaction_hash: null })]),
    ).toEqual([])
  })
})
