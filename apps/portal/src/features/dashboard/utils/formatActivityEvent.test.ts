import { describe, expect, it } from 'vitest'
import type { RecentActivityEvent } from '../hooks/useRecentActivity'
import { formatActivityEvent } from './formatActivityEvent'

const OWNER = '0xdb072374a9bbeba03ae9422ea21d93a4fe7504fd'

const base = {
  name: null,
  transactionHash: '0x01',
  timestamp: 0,
  blockNumber: 0,
  contractAddress: '0x02',
  namehash: null,
} as const

const event = <T extends RecentActivityEvent['type']>(
  type: T,
  data: Extract<RecentActivityEvent, { type: T }>['data'],
  kind?: string,
): RecentActivityEvent => ({ ...base, type, kind, data }) as RecentActivityEvent

const record = (key: string, value?: string) =>
  event('record', { key, ...(value !== undefined && { value }) })

describe('formatActivityEvent', () => {
  it('words a registration by its registrant', () => {
    expect(
      formatActivityEvent(event('registration', { registrant: OWNER })),
    ).toEqual({ text: 'Registered by', actor: OWNER })
  })

  it('falls back to the registration owner', () => {
    expect(
      formatActivityEvent(event('registration', { owner: OWNER })).actor,
    ).toEqual(OWNER)
  })

  it('reads the transfer destination from `to`', () => {
    expect(formatActivityEvent(event('transfer', { to: OWNER }))).toEqual({
      text: 'Ownership transferred to',
      actor: OWNER,
    })
  })

  it('reads the registry owner change from `owner`', () => {
    expect(formatActivityEvent(event('authority', { owner: OWNER }))).toEqual({
      text: 'Ownership transferred to',
      actor: OWNER,
    })
  })

  it('names the new resolver', () => {
    expect(
      formatActivityEvent(
        event('resolver', { resolver: { chain_id: 1, address: OWNER } }),
      ),
    ).toEqual({ text: 'Resolver updated to', actor: OWNER })
  })

  it('words the types with no payload to show', () => {
    expect(formatActivityEvent(event('renewal', {})).text).toBe('Name renewed')
    expect(formatActivityEvent(event('release', {})).text).toBe('Name released')
    expect(formatActivityEvent(event('expiry', {})).text).toBe(
      'Expiry extended',
    )
    expect(formatActivityEvent(event('subregistry', {})).text).toBe(
      'Subregistry updated',
    )
    expect(formatActivityEvent(event('primary_name', {}))).toEqual({
      text: 'Primary name updated',
    })
  })

  it('tells a fuse change from a role change', () => {
    expect(formatActivityEvent(event('permission', { fuses: 1 }))).toEqual({
      text: 'Fuses updated',
    })
    expect(
      formatActivityEvent(
        event('permission', { address: OWNER, powers: ['set_addr'] }),
      ),
    ).toEqual({ text: 'Roles updated', entityFromData: OWNER })
  })

  it('omits a role-change account that is not a valid address', () => {
    expect(
      formatActivityEvent(
        event('permission', {
          address: '0xnot-an-addr' as `0x${string}`,
          powers: [],
        }),
      ),
    ).toEqual({ text: 'Roles updated' })
  })

  it('omits an actor that is not a valid address', () => {
    expect(
      formatActivityEvent(
        event('registration', { owner: '0xvitalik' as `0x${string}` }),
      ),
    ).toEqual({ text: 'Registered by' })
  })

  it('carries a text-record key as a value, not appended to the label', () => {
    expect(formatActivityEvent(record('text:com.twitter'))).toEqual({
      text: 'Text record updated',
      value: 'com.twitter',
    })
  })

  it('words the avatar key as a text record', () => {
    expect(formatActivityEvent(record('avatar'))).toEqual({
      text: 'Text record updated',
      value: 'avatar',
    })
  })

  it('sanitizes an attacker-chosen text record key', () => {
    expect(
      formatActivityEvent(record('text:‮ens.eth\nclaim at evil.example')),
    ).toEqual({
      text: 'Text record updated',
      value: 'ens.eth claim at evil.example',
    })
  })

  it('caps the length of an oversized text record key', () => {
    const { value } = formatActivityEvent(record(`text:${'a'.repeat(500)}`))
    expect(value).toBe(`${'a'.repeat(64)}…`)
  })

  it('drops a text record key with nothing printable in it', () => {
    expect(formatActivityEvent(record('text:​‮'))).toEqual({
      text: 'Text record updated',
    })
  })

  it('does not render an unverified name record as a name entity', () => {
    const formatted = formatActivityEvent(record('name', 'vitalik.eth'))
    expect(formatted).toEqual({
      text: 'Primary name updated',
      value: 'vitalik.eth',
    })
  })

  it('sanitizes an attacker-chosen name record', () => {
    expect(
      formatActivityEvent(record('name', '‮vitalik.eth\nsigned by ENS')),
    ).toEqual({
      text: 'Primary name updated',
      value: 'vitalik.eth signed by ENS',
    })
  })

  it('links an ETH address record as an address entity', () => {
    expect(formatActivityEvent(record('addr:60', OWNER))).toEqual({
      text: 'ETH address updated',
      entityFromData: OWNER,
    })
  })

  it('does not treat non-ETH address bytes as an address', () => {
    expect(formatActivityEvent(record('addr:0', '0x00a1b2'))).toEqual({
      text: 'Address updated',
    })
  })

  it('omits the entity when the ETH value is not a valid address', () => {
    expect(formatActivityEvent(record('addr:60', '0xdead'))).toEqual({
      text: 'ETH address updated',
    })
  })

  it('words contenthash, resets and other keys', () => {
    expect(formatActivityEvent(record('contenthash')).text).toBe(
      'Contenthash updated',
    )
    expect(
      formatActivityEvent(event('record', {}, 'RecordVersionChanged')),
    ).toEqual({ text: 'Resolver records cleared' })
    expect(formatActivityEvent(record('abi:1'))).toEqual({
      text: 'Record updated',
      value: 'abi:1',
    })
  })
})

describe('formatActivityEvent — bigname v0.4.1 rows', () => {
  it('words a migration', () => {
    expect(
      formatActivityEvent(
        event('migration', { migration_path: 'unwrapped' }, 'MigrationApplied'),
      ),
    ).toEqual({ text: 'Migrated to ENSv2' })
  })

  it('words a type newer than the client by its raw kind instead of throwing', () => {
    const future = {
      ...base,
      type: 'future_type',
      kind: 'FutureThingChanged',
      data: {},
    } as unknown as RecentActivityEvent
    expect(formatActivityEvent(future)).toEqual({
      text: 'Future thing changed',
    })
  })

  it('shows a set primary-name claim as a sanitized value pill', () => {
    expect(
      formatActivityEvent(
        event('primary_name', { name: 'alice.eth', name_status: 'set' }),
      ),
    ).toEqual({ text: 'Primary name updated', value: 'alice.eth' })
    expect(
      formatActivityEvent(event('primary_name', { name_status: 'cleared' })),
    ).toEqual({ text: 'Primary name updated' })
  })

  it('reads an ETH address value served as raw bytes', () => {
    expect(
      formatActivityEvent(
        event('record', {
          key: 'addr:60',
          value: { encoding: 'hex', bytes: OWNER },
        }),
      ),
    ).toEqual({ text: 'ETH address updated', entityFromData: OWNER })
  })
})
