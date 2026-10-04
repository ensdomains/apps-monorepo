import type { HistoryEventDataByType } from '@ens-apps/bigname'
import { describe, expect, it } from 'vitest'
import type { HistoryEventType, TimelineEvent } from '../timelineEvent'
import { describeEvent, formatPower, humanizeType } from './descriptors'

const event = <TType extends HistoryEventType>(
  type: TType,
  data: HistoryEventDataByType[TType],
  extra: Partial<Omit<TimelineEvent, 'type' | 'data'>> = {},
): TimelineEvent =>
  ({
    id: '1',
    type,
    name: 'collector.eth',
    registrationId: null,
    transactionHash: '0xabc',
    blockNumber: 1,
    logIndex: 0,
    timestamp: 1,
    data,
    ...extra,
  }) as TimelineEvent

const ADDRESS = '0x801d2e48d378f161dba7ad7ad002ad557714c191'
const CONTRACT = '0xb88b00000000000000000000000000000000fa98'

describe('humanizeType', () => {
  it('sentence-cases camel-cased raw kinds', () => {
    expect(humanizeType('LabelRegistered')).toBe('Label registered')
    expect(humanizeType('RecordVersionChanged')).toBe('Record version changed')
  })

  it('preserves acronyms', () => {
    expect(humanizeType('EACRolesChanged')).toBe('EAC roles changed')
  })

  it('reads snake-cased types as words', () => {
    expect(humanizeType('primary_name')).toBe('Primary name')
  })
})

describe('formatPower', () => {
  it('words a power and marks its admin variant', () => {
    expect(formatPower('set_addr')).toBe('Set addr')
    expect(formatPower('admin_set_text')).toBe('Set text Admin')
  })
})

describe('history labels', () => {
  it('an addr record reads "set address to" with an address badge', () => {
    expect(
      describeEvent(
        event('record', { key: 'addr:60', coin_type: 60, value: ADDRESS }),
      ),
    ).toEqual({
      icon: 'address',
      label: 'set address to',
      slots: [{ kind: 'address', value: ADDRESS }],
    })
  })

  it('a text record names its key and value', () => {
    expect(
      describeEvent(event('record', { key: 'text:url', value: 'https://x' })),
    ).toEqual({
      icon: 'text',
      label: 'set text record',
      slots: [
        { kind: 'text', value: 'url' },
        { kind: 'glyph', value: '→' },
        { kind: 'text', value: 'https://x' },
      ],
    })
  })

  it('a record-version reset reads as clearing the records', () => {
    expect(
      describeEvent(event('record', {}, { kind: 'RecordVersionChanged' })),
    ).toEqual({ label: 'cleared records', slots: [] })
  })

  it('a registration names what was registered and leaves the actor to the row', () => {
    expect(describeEvent(event('registration', { owner: ADDRESS }))).toEqual({
      label: 'registered',
      slots: [{ kind: 'name', value: 'collector.eth' }],
    })
  })

  it('a child registration reads as a subname', () => {
    expect(
      describeEvent(
        event(
          'registration',
          {},
          { name: 'sub.collector.eth', subject: 'child' },
        ),
      ),
    ).toEqual({
      icon: 'subname',
      label: 'registered subname',
      slots: [{ kind: 'name', value: 'sub.collector.eth' }],
    })
  })

  it('a resolver change carries a resolver contract badge', () => {
    expect(
      describeEvent(
        event('resolver', {
          resolver: { chain_id: 11155111, address: CONTRACT },
        }),
      ),
    ).toEqual({
      label: 'updated resolver to',
      slots: [{ kind: 'contract', value: CONTRACT, label: 'resolver' }],
    })
  })

  it('a resolver row without a resolver is a clearing', () => {
    expect(describeEvent(event('resolver', {}))).toEqual({
      label: 'cleared resolver',
      slots: [],
    })
  })

  it('a subregistry link marks the contract slot as a registry', () => {
    expect(
      describeEvent(
        event('subregistry', {
          subregistry: { chain_id: 11155111, address: CONTRACT },
        }),
      ),
    ).toEqual({
      label: 'linked subregistry',
      slots: [{ kind: 'contract', value: CONTRACT, isRegistry: true }],
    })
  })

  it('a renewal names the renewed name so the row does not end on the verb', () => {
    expect(describeEvent(event('renewal', {}))).toEqual({
      label: 'renewed',
      slots: [{ kind: 'name', value: 'collector.eth' }],
    })
  })

  it('a permission row lists the powers the subject holds', () => {
    expect(
      describeEvent(
        event('permission', {
          address: ADDRESS,
          powers: ['set_addr', 'set_text'],
        }),
      ),
    ).toEqual({
      label: 'set roles',
      slots: [
        { kind: 'text', value: 'Set addr, Set text' },
        { kind: 'connective', value: 'for' },
        { kind: 'actor', txHash: '0xabc', address: ADDRESS },
      ],
    })
  })

  it('a permission row with no powers left reads as a revocation', () => {
    expect(
      describeEvent(event('permission', { address: ADDRESS, powers: [] })),
    ).toMatchObject({ icon: 'revoke', label: 'revoked roles from' })
  })

  it('a mint transfer describes as nothing', () => {
    expect(describeEvent(event('transfer', { to: ADDRESS }))).toBeNull()
  })
})
