import { describe, expect, it } from 'vitest'
import type { TimelineIndexerEvent } from '../timelineEvent'
import { DESCRIPTORS, humanizeType } from './descriptors'

describe('humanizeType', () => {
  it('sentence-cases camel-cased event types', () => {
    expect(humanizeType('NameRegistered')).toBe('Name registered')
    expect(humanizeType('SubregistryUpdated')).toBe('Subregistry updated')
    expect(humanizeType('AddrChanged')).toBe('Addr changed')
  })

  it('preserves acronyms', () => {
    expect(humanizeType('EACRolesChanged')).toBe('EAC roles changed')
  })
})

describe('history labels', () => {
  const base = {
    id: '1',
    transactionHash: '0xabc',
    blockNumber: 1,
    timestamp: 1,
    name: 'collector.eth',
  } as const

  it('AddressChanged reads "set address to"', () => {
    const built = DESCRIPTORS.AddressChanged.build({
      ...base,
      type: 'AddressChanged',
      asAddressChanged: {
        address: '0x801d2e48d378f161dba7ad7ad002ad557714c191',
        coinType: 60,
      },
    } as TimelineIndexerEvent)
    expect(built).toMatchObject({
      label: 'set address to',
      slots: [
        {
          kind: 'address',
          value: '0x801d2e48d378f161dba7ad7ad002ad557714c191',
        },
      ],
    })
  })

  it('NameRegistered names what was registered and leaves the actor to the row', () => {
    const built = DESCRIPTORS.NameRegistered.build({
      ...base,
      type: 'NameRegistered',
      asNameRegistered: {
        name: 'collector.eth',
        owner: '0xowner000000000000000000000000000000000001',
      },
    } as TimelineIndexerEvent)
    expect(built).toEqual({
      label: 'registered',
      slots: [{ kind: 'name', value: 'collector.eth' }],
    })
  })

  it('ResolverUpdated includes a resolver contract badge', () => {
    const built = DESCRIPTORS.ResolverUpdated.build({
      ...base,
      type: 'ResolverUpdated',
      asResolverUpdated: {
        resolver: '0xb88b00000000000000000000000000000000Fa98',
      },
    } as TimelineIndexerEvent)
    expect(built).toEqual({
      label: 'updated resolver to',
      slots: [
        {
          kind: 'contract',
          value: '0xb88b00000000000000000000000000000000Fa98',
          label: 'resolver',
        },
      ],
    })
  })

  it('SubregistryUpdated marks the contract slot as a registry', () => {
    const built = DESCRIPTORS.SubregistryUpdated.build({
      ...base,
      type: 'SubregistryUpdated',
      data: JSON.stringify({
        registry: '0x541C00000000000000000000000000000000976F',
      }),
    } as TimelineIndexerEvent)
    expect(built).toEqual({
      label: 'deployed and linked subregistry',
      slots: [
        {
          kind: 'contract',
          value: '0x541C00000000000000000000000000000000976F',
          isRegistry: true,
        },
      ],
    })
  })

  it('NameRenewed names the renewed name so the row does not end on the verb', () => {
    const built = DESCRIPTORS.NameRenewed.build({
      ...base,
      type: 'NameRenewed',
    } as TimelineIndexerEvent)
    expect(built).toEqual({
      label: 'renewed',
      slots: [{ kind: 'name', value: 'collector.eth' }],
    })
  })

  it('v2 NameWrapped reads as the migration of the name', () => {
    const built = DESCRIPTORS.NameWrapped.build({
      ...base,
      type: 'NameWrapped',
      protocol: 'v2',
    } as TimelineIndexerEvent)
    expect(built).toEqual({
      label: 'migrated',
      slots: [
        { kind: 'name', value: 'collector.eth' },
        { kind: 'connective', value: 'to ENSv2' },
      ],
    })
  })
})
