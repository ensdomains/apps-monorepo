import type { Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from './summarizeEvents'

const ZERO = '0x0000000000000000000000000000000000000000'
const OWNER = '0x1111111111111111111111111111111111111111'

const event = (
  type: string,
  id: string,
  extra: Partial<TimelineIndexerEvent> = {},
): TimelineIndexerEvent =>
  ({
    id,
    type,
    name: 'alice.eth',
    transactionHash: '0xabc' as Hex,
    blockNumber: 1,
    timestamp: 1_700_000_000,
    ...extra,
  }) as TimelineIndexerEvent

const records = [
  event('AddressChanged', 'r1', {
    asAddressChanged: { address: OWNER, coinType: 60 },
  }),
  event('TextChanged', 'r2', { asTextChanged: { key: 'avatar', value: 'x' } }),
  event('TextChanged', 'r3', { asTextChanged: { key: 'url', value: 'y' } }),
]

describe('summarizeEvents — records recipe vs structural events', () => {
  it('headlines a v2 register-and-seed-records transaction as the register', () => {
    const [action] = summarizeEvents([
      event('NameRegistered', '1', { asNameRegistered: { name: 'alice.eth' } }),
      event('Transfer', '2', { asTransfer: { from: ZERO, to: OWNER } }),
      ...records,
    ])

    expect(action.label).toBe('Register name')
    // The records are still on the action; only the headline changed.
    expect(action.events).toHaveLength(5)
  })

  it('still headlines a resolver change plus records as the records', () => {
    const [action] = summarizeEvents([
      event('ResolverUpdated', '1', { asResolverUpdated: { resolver: OWNER } }),
      ...records,
    ])

    expect(action.label).toBe('Set 3 records')
  })

  it('does not let a mint Transfer — which describes as nothing — swallow the recipe', () => {
    const [action] = summarizeEvents([
      event('Transfer', '1', { asTransfer: { from: ZERO, to: OWNER } }),
      ...records,
    ])

    expect(action.label).toBe('Set 3 records')
  })

  it('lets a real Transfer headline over the records', () => {
    const [action] = summarizeEvents([
      event('Transfer', '1', { asTransfer: { from: OWNER, to: ZERO } }),
      ...records,
    ])

    expect(action.label).toBe('Transfer name')
  })
})

describe('summarizeEvents — includeSubjectName', () => {
  const resolverUpdated = event('ResolverUpdated', '1', {
    name: 'profile.allora.eth',
    asResolverUpdated: { resolver: OWNER },
  })

  it('leaves a name-page row untouched by default', () => {
    const [action] = summarizeEvents([resolverUpdated])

    expect(action.label).toBe('Update resolver')
    expect(action.slots.map((slot) => slot.kind)).toEqual(['contract'])
  })

  it('leads an anonymous row with its subject when asked', () => {
    const [action] = summarizeEvents([resolverUpdated], {
      includeSubjectName: true,
    })

    expect(action.slots).toEqual([
      { kind: 'name', value: 'profile.allora.eth' },
      { kind: 'glyph', value: '→' },
      { kind: 'contract', value: OWNER, label: 'resolver' },
    ])
  })

  it('does not repeat a name the descriptor already renders', () => {
    const [action] = summarizeEvents(
      [
        event('LabelRegistered', '1', {
          name: 'profile.allora.eth',
          asLabelRegistered: { name: 'profile.allora.eth' },
        }),
      ],
      { includeSubjectName: true },
    )

    expect(action.label).toBe('Register subname')
    expect(action.slots).toEqual([
      { kind: 'name', value: 'profile.allora.eth' },
    ])
  })

  it('omits the arrow when the descriptor renders the subject alone', () => {
    const [action] = summarizeEvents(
      [
        event('SubregistryUpdated', '1', {
          name: 'renewal.allora.eth',
          data: JSON.stringify({ registry: ZERO }),
        }),
      ],
      { includeSubjectName: true },
    )

    expect(action.label).toBe('Unlink subregistry')
    expect(action.slots).toEqual([
      { kind: 'name', value: 'renewal.allora.eth' },
    ])
  })
})
