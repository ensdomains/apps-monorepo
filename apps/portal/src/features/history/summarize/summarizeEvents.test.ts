import type { HistoryEventDataByType } from '@ens-apps/bigname'
import type { Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import type { HistoryEventType, TimelineEvent } from '../timelineEvent'
import { summarizeEvents } from './summarizeEvents'

const ZERO = '0x0000000000000000000000000000000000000000'
const OWNER = '0x1111111111111111111111111111111111111111'
const RESOLVER = '0x2222222222222222222222222222222222222222'

const event = <TType extends HistoryEventType>(
  type: TType,
  id: string,
  data: HistoryEventDataByType[TType] = {},
  extra: Partial<Omit<TimelineEvent, 'type' | 'data'>> = {},
): TimelineEvent =>
  ({
    id,
    type,
    name: 'alice.eth',
    registrationId: null,
    transactionHash: '0xabc' as Hex,
    blockNumber: 1,
    logIndex: 0,
    timestamp: 1_700_000_000,
    data,
    ...extra,
  }) as TimelineEvent

const records = [
  event('record', 'r1', { key: 'addr:60', coin_type: 60, value: OWNER }),
  event('record', 'r2', { key: 'text:avatar', value: 'x' }),
  event('record', 'r3', { key: 'text:url', value: 'y' }),
]

describe('summarizeEvents — records recipe vs structural rows', () => {
  it('headlines a register-and-seed-records transaction as the registration', () => {
    const [action] = summarizeEvents([
      event('registration', '1', { owner: OWNER }),
      event('transfer', '2', { from: ZERO, to: OWNER }),
      ...records,
    ])

    expect(action.label).toBe('registered')
    // The records are still on the action; only the headline changed.
    expect(action.events).toHaveLength(5)
  })

  it('still headlines a resolver change plus records as the records', () => {
    const [action] = summarizeEvents([
      event('resolver', '1', {
        resolver: { chain_id: 11155111, address: RESOLVER },
      }),
      ...records,
    ])

    expect(action.label).toBe('set 3 records')
  })

  it('does not let a mint — which describes as nothing — swallow the recipe', () => {
    const [action] = summarizeEvents([
      event('transfer', '1', { to: OWNER }),
      ...records,
    ])

    expect(action.label).toBe('set 3 records')
  })

  it('lets a real transfer headline over the records', () => {
    const [action] = summarizeEvents([
      event('transfer', '1', { from: OWNER, to: RESOLVER }),
      ...records,
    ])

    expect(action.label).toBe('transferred')
  })

  it('counts a legacy setAddr double emit as one write', () => {
    // `setAddr(node, a)` logs both AddrChanged and AddressChanged; bigname keeps
    // both as `addr:60` rows with the same value.
    const [action] = summarizeEvents([
      event(
        'record',
        'a1',
        { key: 'addr:60', value: OWNER },
        { kind: 'RecordChanged' },
      ),
      event(
        'record',
        'a2',
        { key: 'addr:60', value: OWNER },
        { kind: 'RecordChanged' },
      ),
      event('record', 't1', { key: 'text:url', value: 'y' }),
    ])

    expect(action.label).toBe('set 2 records')
    expect(action.events).toHaveLength(3)
  })
})

describe('summarizeEvents — grouping', () => {
  it('makes one action per transaction, keyed by its hash', () => {
    const actions = summarizeEvents([
      event('renewal', '1', {}, { transactionHash: '0xaa', timestamp: 2 }),
      event('expiry', '2', {}, { transactionHash: '0xaa', timestamp: 2 }),
      event('renewal', '3', {}, { transactionHash: '0xbb', timestamp: 1 }),
    ])

    expect(actions.map((action) => action.id)).toEqual(['0xaa', '0xbb'])
    expect(actions[0].txHash).toBe('0xaa')
    expect(actions[0].label).toBe('renewed')
    expect(actions[0].events).toHaveLength(2)
  })

  it('gives a state-derived row an action of its own, with no transaction', () => {
    // A lapse after grace has no transaction hash or log index.
    const [release] = summarizeEvents([
      event('release', 'lapse', {}, { transactionHash: null }),
    ])

    expect(release.id).toBe('row:lapse')
    expect(release.txHash).toBeUndefined()
    expect(release.label).toBe('released')
  })
})

describe('summarizeEvents — includeSubjectName', () => {
  const resolverChanged = event(
    'resolver',
    '1',
    { resolver: { chain_id: 11155111, address: RESOLVER } },
    { name: 'profile.allora.eth' },
  )

  it('leaves a name-page row untouched by default', () => {
    const [action] = summarizeEvents([resolverChanged])

    expect(action.label).toBe('updated resolver to')
    expect(action.slots.map((slot) => slot.kind)).toEqual(['contract'])
  })

  it('closes an anonymous row with its subject when asked', () => {
    const [action] = summarizeEvents([resolverChanged], {
      includeSubjectName: true,
    })

    expect(action.slots).toEqual([
      { kind: 'contract', value: RESOLVER, label: 'resolver' },
      { kind: 'connective', value: 'on' },
      { kind: 'name', value: 'profile.allora.eth' },
    ])
  })

  it('does not repeat a name the descriptor already renders', () => {
    const [action] = summarizeEvents(
      [
        event(
          'registration',
          '1',
          {},
          { name: 'profile.allora.eth', subject: 'child' },
        ),
      ],
      { includeSubjectName: true },
    )

    expect(action.label).toBe('registered subname')
    expect(action.slots).toEqual([
      { kind: 'name', value: 'profile.allora.eth' },
    ])
  })

  it('reads "{verb} on {name}" when the descriptor has no slots of its own', () => {
    const [action] = summarizeEvents(
      [event('subregistry', '1', {}, { name: 'renewal.allora.eth' })],
      { includeSubjectName: true },
    )

    expect(action.label).toBe('unlinked subregistry')
    expect(action.slots).toEqual([
      { kind: 'connective', value: 'on' },
      { kind: 'name', value: 'renewal.allora.eth' },
    ])
  })
})

describe('summarizeEvents — a transaction of mints only', () => {
  it('still reads on from the actor, naming the raw kind', () => {
    expect(
      summarizeEvents([
        event(
          'transfer',
          '1',
          { to: OWNER },
          { kind: 'TokenControlTransferred' },
        ),
      ])[0].label,
    ).toBe('emitted token control transferred')
  })
})
